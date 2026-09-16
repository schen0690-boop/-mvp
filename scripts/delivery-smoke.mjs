import './local-network-only.mjs';
import {chromium,expect} from '@playwright/test';
import {startOwned} from '../.cache/startup/scripts/startup/owned-child.js';
import {cleanupOnce} from '../.cache/startup/scripts/startup/readiness.js';
import {DatabaseSync} from 'node:sqlite';
import {DraftService} from '../dist/domain/drafts.js';
import {SqliteDraftStore} from '../dist/db/sqlite-drafts.js';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
const root='evidence/stage-7';mkdirSync(root,{recursive:true});
const report={officialRequests:0,startedAt:new Date().toISOString(),steps:[],source:process.env.DELIVERY_REVISION??'working tree'};
const database=resolve(process.env.DATABASE_PATH??'data/discussions.sqlite');let browser,context,terminal;const children=[];const cleanup=cleanupOnce([async()=>{await context?.close();await browser?.close();},async()=>{for(const c of children.reverse())await c.stop();}]);
async function free(port){const s=createServer();await new Promise((ok,no)=>{s.on('error',no);s.listen(port,'127.0.0.1',()=>s.close(ok));});}
try{await free(41901);await free(41902);const env={...process.env,DEEPSEEK_API_KEY:'',ROSTER_PROVIDER:'fake',DISCUSSION_PROVIDER:'fake',VITE_DISCUSSION_DEMO:'',DATABASE_PATH:database,PORT:'41902'};
 children.push(startOwned('dist/server.js',[],env,true));await expect.poll(async()=>{try{const r=await fetch('http://127.0.0.1:41902/api/config');return r.ok?await r.json():null;}catch{return null;}},{timeout:15000}).toEqual({rosterProvider:'fake',discussionProvider:'fake'});
 children.push(startOwned('node_modules/vite/bin/vite.js',['--config','web/vite.config.ts','--port','41901'],{...env,WEB_API_TARGET:'http://127.0.0.1:41902'}));await expect.poll(async()=>{try{const r=await fetch('http://127.0.0.1:41901/api/config');return r.ok;}catch{return false;}},{timeout:15000}).toBe(true);
 browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext({baseURL:'http://127.0.0.1:41901'});await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});const page=await context.newPage();await page.goto('http://127.0.0.1:41901');await expect(page.locator('footer')).toContainText('阵容：Fake');await page.getByRole('button',{name:'全部讨论',exact:true}).click();await expect(page.locator('.discussion-list li')).toHaveCount(5);await page.getByRole('button',{name:/【预置样例·虚构】AI/}).click();await expect(page.getByRole('button',{name:'确认阵容',exact:true})).toBeVisible();await page.screenshot({path:root+'/samples.png'});
 await page.getByRole('button',{name:'确认阵容',exact:true}).click();await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束',{timeout:20000});await expect(page.getByTestId('utterance')).toHaveCount(13);const id=new URL(page.url()).searchParams.get('discussion');terminal=await (await page.request.get('/api/discussions/'+id)).json();assert.equal(terminal.summary.status,'ready');await page.reload();await expect(page.getByTestId('utterance')).toHaveCount(13);assert.deepEqual(await (await page.request.get('/api/discussions/'+id)).json(),terminal);await page.screenshot({path:root+'/clean-completed.png'});report.steps.push('5 sample lineups visible','manual confirm/start','formal Fake runner completed','refresh same');report.discussionId=id;
}finally{try{await cleanup();report.steps.push('own services and browser closed');}catch(error){report.cleanupError=error.message;process.exitCode=1;}report.finishedAt=new Date().toISOString();writeFileSync(root+'/smoke.json',JSON.stringify(report,null,2));}
if(terminal){assert.equal(existsSync(database+'.owner'),false);const db=new DatabaseSync(database,{readOnly:true});try{assert.deepEqual(new DraftService(new SqliteDraftStore(db)).get(terminal.discussionId),terminal);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');report.steps.push('stop then readonly reopen identical');}finally{db.close();}writeFileSync(root+'/smoke.json',JSON.stringify(report,null,2));}
