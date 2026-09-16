// Explicit one-shot browser execution. A second invocation cannot click start again.
import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,basename} from 'node:path';
import assert from 'node:assert/strict';
const local=process.argv.includes('--local'),readonly=process.argv.includes('--read-only');
const root=local?resolve(process.argv[process.argv.indexOf('--local')+1]):resolve('.local/stage-6b-live');
if(local){const rel=relative(resolve('.tmp/stage-6b'),root);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));}
const out=local?'evidence/stage-6b/local-'+basename(root):'evidence/stage-6b/live',prepared=JSON.parse(readFileSync(root+'/prepared.json','utf8')),id=prepared.discussionId,auth=root+'/authorization';
mkdirSync(out,{recursive:true});const save=(name,value)=>writeFileSync(out+'/'+name+'.json',JSON.stringify(value,null,2)+'\n',{flag:'wx'});
if(!readonly){assert(!existsSync(auth+'/started.json')&&!existsSync(auth+'/closed.json'));assert(!readdirSync(auth).some(f=>/^(ordinary|summary)-\d+\.json$/.test(f)));}
const record={startedAt:new Date().toISOString(),codeRevision:prepared.codeRevision,localHttpStub:local,discussionId:id,runId:prepared.runId,posts:[],steps:{},sse:[]};
const suffix=readonly?'-recovery-'+Date.now():'';save('ui-start'+suffix,record);
let browser,context,page,stage='open';
try{
 browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext({baseURL:'http://127.0.0.1:41881',viewport:{width:1600,height:1000}});page=await context.newPage();page.setDefaultTimeout(12000);
 await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:41881'?route.continue():route.abort());
 page.on('request',r=>{if(r.method()==='POST')record.posts.push(new URL(r.url()).pathname);});
 await page.exposeFunction('recordPublicEvent',event=>record.sse.push(event));
 await page.addInitScript(()=>{const Native=window.EventSource;window.EventSource=class extends Native{constructor(url,options){super(url,options);for(const type of ['utterance.created','synthesis.updated','summary.ready','discussion.status_changed'])this.addEventListener(type,e=>{try{const x=JSON.parse(e.data);void window.recordPublicEvent({type,eventId:x.eventId,dataVersion:x.dataVersion,occurredAt:x.occurredAt,status:x.payload.status,seq:x.payload.utterance?.seq,sourceTranscriptVersion:x.payload.synthesis?.sourceTranscriptVersion});}catch{}});}};});
 const snapshot=async()=>{const r=await page.request.get(`/api/discussions/${id}`);assert.equal(r.status(),200);return r.json();};
 await page.goto('/?discussion='+id);const initial=await snapshot();save('initial'+suffix,initial);assert.equal(initial.lineupGeneration.generationId,prepared.generationId);assert.equal(initial.confirmedLineupRevision,prepared.lineupRevision);
 if(!readonly){assert.equal(initial.status,'lineup_confirmed');stage='start';await page.getByRole('button',{name:'开始讨论',exact:true}).click();record.steps.startClickedOnce=true;}
 stage='observe';let terminal;
 await expect.poll(async()=>{
  const s=await snapshot();assert.equal(s.runtime?.runId,prepared.runId);
  if(s.status==='running'&&s.utterances.length&&!record.steps.runningScreenshot){await page.screenshot({path:out+'/running'+suffix+'.png'});save('running'+suffix,s);record.steps.runningScreenshot=true;}
  if(s.status==='running'&&s.synthesis&&!record.steps.middleScreenshot){const text=await page.getByTestId('discussion-status').textContent();if(text==='讨论运行中'){await page.screenshot({path:out+'/middle'+suffix+'.png'});save('middle'+suffix,s);record.steps.middleScreenshot=true;}}
  if(['completed','failed'].includes(s.status))terminal=s;return s.status;
 },{timeout:190000,intervals:[100,250,500,1000]}).toMatch(/completed|failed/);
 stage='terminal';save('terminal'+suffix,terminal);await expect(page.getByTestId('discussion-status')).toHaveText(terminal.status==='completed'?'讨论已结束':'讨论已中断');await expect(page.getByTestId('utterance')).toHaveCount(terminal.utterances.length);await page.screenshot({path:out+'/terminal'+suffix+'.png'});
 record.steps.savedAndDisplayed=true;record.steps.summary=terminal.summary?.status??'none';record.steps.synthesis=!!terminal.synthesis;
 stage='refresh';await page.reload();await expect(page.getByTestId('discussion-status')).toHaveText(terminal.status==='completed'?'讨论已结束':'讨论已中断');const refreshed=await snapshot();assert.deepEqual(refreshed,terminal);save('refreshed'+suffix,refreshed);await page.screenshot({path:out+'/refreshed'+suffix+'.png'});record.steps.refreshMatches=true;
 assert.equal(record.posts.filter(p=>p.endsWith('/start')).length,readonly?0:1);record.outcome=terminal.status==='failed'?'failed':terminal.summary?.status!=='ready'?'degraded':terminal.utterances.filter(u=>terminal.roles.find(m=>m.memberId===u.roleId)?.role==='expert').length===2&&terminal.synthesis?'normal_path':'partial_path';
}catch{record.outcome='interrupted_needs_read_only_verification';record.stoppedAt=stage;process.exitCode=1;if(page){try{const r=await page.request.get(`/api/discussions/${id}`);if(r.ok())save('recovery-snapshot'+suffix,await r.json());}catch{}}}
finally{await context?.close();await browser?.close();record.browserClosed=true;record.endedAt=new Date().toISOString();save('ui-result'+suffix,record);console.log(JSON.stringify(record));}
