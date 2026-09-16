import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.E2E_LOCAL_EVIDENCE_ROOT??'evidence/stage-6a';mkdirSync(root+'/screenshots',{recursive:true});
for(const failed of [false,true])test(`真实适配器经本地HTTP替身验证：${failed?'总结降级':'完整流程与刷新'}`,async({page})=>{
 const token=randomUUID();await page.goto('/');await page.getByLabel('讨论话题',{exact:true}).fill(`AI如何改善教育？ [local:${token}]${failed?' [summary-fail]':''}`);await page.getByLabel('专家人数',{exact:true}).selectOption('2');await page.getByRole('button',{name:'创建草稿',exact:true}).click();await page.getByRole('button',{name:'生成阵容',exact:true}).click();await page.getByRole('button',{name:'确认阵容',exact:true}).click();
 const id=new URL(page.url()).searchParams.get('discussion')!;let streamed=false;page.on('response',r=>{if(r.url().includes('/events?')&&r.headers()['content-type']?.includes('text/event-stream'))streamed=true;});await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);await expect(page.getByTestId('finding')).not.toHaveCount(0);await expect(page.getByTestId('discussion-status')).toHaveText('讨论运行中');await expect(page.locator('.fake-label')).toHaveText('真实适配器经本地 HTTP 替身验证');expect(streamed).toBe(true);
 const read=async()=>(await (await page.request.get(`/api/discussions/${id}`)).json());const middle=await read();expect(middle.utterances[0].sentences[0]).toContain('课堂效果');expect(middle.synthesis.sourceTranscriptVersion).toBe(3);
 if(!failed)await page.screenshot({path:root+'/screenshots/local-running.png'});mkdirSync('.tmp/stage-6a/gates',{recursive:true});writeFileSync(`.tmp/stage-6a/gates/${token}`,'release',{flag:'wx'});
 await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束',{timeout:15000});await expect(page.getByTestId('utterance')).toHaveCount(13);const before=await read();expect(before.summary.status).toBe(failed?'unavailable':'ready');expect(JSON.stringify(before)).not.toMatch(/STUB_PRIVATE|reasoning_content|local-stub-credential/);
 await expect(page.getByRole('region',{name:'结束总结'})).toContainText(failed?'总结生成失败':'本场已提交13条');await page.screenshot({path:root+`/screenshots/local-${failed?'summary-unavailable':'completed'}.png`});await page.reload();await expect(page.getByTestId('utterance')).toHaveCount(13);expect(await read()).toEqual(before);
 if(!failed)await page.screenshot({path:root+'/screenshots/local-refreshed.png'});
 const db=new DatabaseSync(process.env.STAGE6A_DATABASE!,{readOnly:true});let counters;try{counters=db.prepare('SELECT calls_used,summary_calls_used FROM discussions WHERE id=?').get(id);}finally{db.close();}
 writeFileSync(root+`/local-${failed?'failure':'success'}.json`,JSON.stringify({label:'真实适配器经本地 HTTP 替身验证',officialRequests:0,discussionId:id,runId:before.runtime.runId,streamed,middleTranscriptVersion:middle.transcriptVersion,finalTranscriptVersion:before.transcriptVersion,summary:before.summary,counters,refreshMatches:true},null,2)+'\n');
});
