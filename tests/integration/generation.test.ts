import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { temporaryDatabase } from '../helpers/database.js';
import { initializeDatabase } from '../../src/db/database.js';
import { SqliteDraftStore } from '../../src/db/sqlite-drafts.js';
import { SqliteLineupStore } from '../../src/db/sqlite-lineup.js';
import { DraftService } from '../../src/domain/drafts.js';
import { LineupService, type LineupOptions } from '../../src/domain/lineup-service.js';
import { colors } from '../../src/domain/lineup.js';
import { FakeRosterProvider, type FakeMode } from '../../src/providers/fake-roster.js';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
function setup(provider = new FakeRosterProvider(), options: LineupOptions = {}) {
  const { db, path } = temporaryDatabase(); initializeDatabase(db);
  const drafts = new DraftService(new SqliteDraftStore(db));
  const service = new LineupService(new SqliteLineupStore(db), provider, options);
  cleanups.push(async () => { await service.close(); db.close(); });
  const created = drafts.create({ topic: '中文 “阵容” 内部 空格', requestId: randomUUID() });
  return { db, path, drafts, service, provider, id: created.discussionId, original: created.snapshot };
}
it('accepts created, persists current generation, and commits one complete system-owned lineup', async () => {
  const x = setup(); const body = { requestId: randomUUID(), expectedGenerationId: null };
  const accepted = x.service.generate(x.id, body);
  expect(accepted.snapshot.status).toBe('generating_lineup');
  expect(accepted.snapshot.roles).toEqual([]);
  expect(x.service.generate(x.id, body).replayed).toBe(true);
  expect(() => x.service.generate(x.id, { ...body, requestId: randomUUID() })).toThrow();
  await x.service.idle();
  const ready = x.drafts.get(x.id);
  expect(ready.status).toBe('awaiting_confirmation');
  expect(ready).toMatchObject({ topic: x.original.topic, expertCount: 4, createdAt: x.original.createdAt, version: 3, lastEventId: 3, lineupRevision: 1 });
  expect(ready.roles.map(m => m.color)).toEqual(colors.slice(0, 5));
  expect(ready.roles.map(m => m.displayOrder)).toEqual([0, 1, 2, 3, 4]);
  expect(new Set(ready.roles.map(m => m.memberId)).size).toBe(5);
  expect(x.provider.calls).toHaveLength(1);
  expect(x.provider.calls[0]?.input).toMatchObject({ discussionId: x.id, topic: x.original.topic, expertCount: 4 });
  expect(x.db.prepare('SELECT count(*) AS n FROM public_events').get()?.n).toBe(3);
  expect(x.service.generate(x.id, body).snapshot).toEqual(ready);
});
it.each<{ mode: FakeMode; code: string; attempts: number }>([
  {mode:'transport',code:'LINEUP_PROVIDER_UNAVAILABLE',attempts:2},
  {mode:'configuration',code:'LINEUP_PROVIDER_CONFIGURATION',attempts:1},
  {mode:'invalid-structure',code:'LINEUP_INVALID_STRUCTURE',attempts:2},
  {mode:'few',code:'LINEUP_INVALID_MEMBERS',attempts:2}
])('classifies $mode and persists failure without partial members', async ({mode,code,attempts}) => {
  const x = setup(new FakeRosterProvider([mode]));
  x.service.generate(x.id, {requestId:randomUUID(),expectedGenerationId:null}); await x.service.idle();
  expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_generation_failed',roles:[],version:3,lastNotice:{code,retryable:mode !== 'configuration'}});
  expect(x.provider.calls).toHaveLength(attempts);
  expect(x.db.prepare('SELECT count(*) AS n FROM lineup_members').get()?.n).toBe(0);
});
it('transport retry and output repair share two calls; repair sends only safe rule feedback', async () => {
  const x = setup(new FakeRosterProvider(['transport','invalid-structure','normal']));
  const a = x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null}); await x.service.idle();
  expect(x.provider.calls).toHaveLength(2); expect(x.drafts.get(x.id).lastNotice?.code).toBe('LINEUP_INVALID_STRUCTURE');
  expect(x.provider.calls[1]?.context.repairIssues).toBeUndefined();
  const b=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId}); await x.service.idle();
  expect(b.generationVersion).toBe(2); expect(b.generationId).not.toBe(a.generationId);
  expect(x.drafts.get(x.id).lineupRevision).toBe(2);
  const y=setup(new FakeRosterProvider(['few','normal'])); y.service.generate(y.id,{requestId:randomUUID(),expectedGenerationId:null}); await y.service.idle();
  expect(y.drafts.get(y.id).status).toBe('awaiting_confirmation');
  expect(y.provider.calls[1]?.context.repairIssues).toEqual([{path:'roles',rule:'LINEUP_INVALID_MEMBERS'}]);
});
it('regenerate invalidates old lineup immediately; failure retains only historical rows and later success replaces the group', async () => {
  const x=setup(new FakeRosterProvider(['normal','few','few','normal']));
  const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null}); await x.service.idle();
  const old=x.drafts.get(x.id).roles;
  const b=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:a.generationId});
  expect(x.drafts.get(x.id)).toMatchObject({status:'generating_lineup',roles:[],lineupRevision:1});
  expect(x.db.prepare('SELECT member_id FROM lineup_members ORDER BY display_order').all().map(r=>r.member_id)).toEqual(old.map(m=>m.memberId));
  await x.service.idle(); expect(x.drafts.get(x.id)).toMatchObject({status:'lineup_generation_failed',roles:[],lineupRevision:1});
  expect(x.db.prepare('SELECT count(*) AS n FROM lineup_members').get()?.n).toBe(5);
  x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:b.generationId}); await x.service.idle();
  const next=x.drafts.get(x.id); expect(next.lineupRevision).toBe(3); expect(next.roles.some(m=>old.some(o=>o.memberId===m.memberId))).toBe(false);
  expect(x.db.prepare('SELECT count(*) AS n FROM lineup_members').get()?.n).toBe(5);
  expect(x.db.prepare("SELECT count(*) AS n FROM public_events WHERE json_extract(payload,'$.status')='awaiting_confirmation'").get()?.n).toBe(2);
});
it('capacity rejects without a state write and replay consumes no additional slot', async () => {
  let release!: (value:string)=>void;
  const x=setup(new FakeRosterProvider([()=>new Promise(resolve=>{release=resolve;})]),{capacity:1});
  const body={requestId:randomUUID(),expectedGenerationId:null}; x.service.generate(x.id,body);
  const other=x.drafts.create({topic:'容量',requestId:randomUUID()});
  expect(()=>x.service.generate(other.discussionId,{requestId:randomUUID(),expectedGenerationId:null})).toThrow('容量');
  expect(x.drafts.get(other.discussionId).status).toBe('created'); expect(x.service.generate(x.id,body).replayed).toBe(true);
  const call=x.provider.calls[0]; if(!call) throw new Error('missing call');
  release(await new FakeRosterProvider().generateRoster(call.input,call.context)); await x.service.idle();
});
it('keeps no SQLite write transaction while awaiting provider', async () => {
  let release!: (value: string) => void;
  const provider = new FakeRosterProvider([() => new Promise(resolve => { release = resolve; })]);
  const x = setup(provider); x.service.generate(x.id, { requestId: randomUUID(), expectedGenerationId: null });
  await Promise.resolve();
  expect(x.db.isTransaction).toBe(false);
  const another = x.drafts.create({ topic: '第二场', requestId: randomUUID() });
  expect(another.snapshot.status).toBe('created');
  const call = provider.calls[0]; if (!call) throw new Error('provider not called');
  release(await new FakeRosterProvider().generateRoster(call.input, call.context));
  await x.service.idle(); expect(x.drafts.get(another.discussionId).status).toBe('created');
});
it('two active discussions can finish out of order without mixing topic, count, generation or members',async()=>{
  const releases=new Map<string,(value:string)=>void>();
  const provider=new FakeRosterProvider([(input)=>new Promise(resolve=>releases.set(input.discussionId,resolve))]);
  const x=setup(provider);const other=x.drafts.create({topic:'第二场不同话题',expertCount:1,requestId:randomUUID()});
  const a=x.service.generate(x.id,{requestId:randomUUID(),expectedGenerationId:null});
  const b=x.service.generate(other.discussionId,{requestId:randomUUID(),expectedGenerationId:null});
  const second=provider.calls.find(c=>c.input.discussionId===other.discussionId);if(!second)throw new Error('missing second');
  releases.get(other.discussionId)?.(await new FakeRosterProvider().generateRoster(second.input,second.context));
  await expect.poll(()=>x.drafts.get(other.discussionId).status).toBe('awaiting_confirmation');
  expect(x.drafts.get(x.id).status).toBe('generating_lineup');
  const first=provider.calls.find(c=>c.input.discussionId===x.id);if(!first)throw new Error('missing first');
  releases.get(x.id)?.(await new FakeRosterProvider().generateRoster(first.input,first.context));await x.service.idle();
  expect(x.drafts.get(x.id).roles).toHaveLength(5);expect(x.drafts.get(other.discussionId).roles).toHaveLength(2);
  expect(a.generationId).not.toBe(b.generationId);expect(first.input.topic).toBe(x.original.topic);expect(second.input.topic).toBe('第二场不同话题');
  expect(x.drafts.get(other.discussionId).lineupGeneration?.generationId).toBe(b.generationId);
});
