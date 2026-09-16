import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Studio,followTranscript} from '../src/Studio.js';
import {sample} from './lineup-fixtures.js';
it('演播厅区分总结不可用和业务失败，保留公开正文，不渲染内部JSON',()=>{
 const s={...sample('lineup_confirmed'),status:'completed' as const,summary:{status:'unavailable' as const,text:null,sourceTranscriptVersion:1},utterances:[{id:crypto.randomUUID(),discussionId:'d',roleId:'r',seq:1,sentences:['真实已提交发言。'],replyToUtteranceIds:[],createdAt:'2026-09-16T00:00:00.000Z'}]};
 const html=renderToStaticMarkup(<Studio snapshot={s} connection="closed" busy={false} error="" stop={()=>{}} reconnect={()=>{}} back={()=>{}}/>);
 expect(html).toContain('讨论已结束，但总结生成失败。');expect(html).toContain('真实已提交发言。');expect(html).toContain('正在读取运行模式');expect(html).not.toContain('sourceTranscriptVersion');expect(html).not.toContain('>开始讨论<');
});
it('向上阅读不跟随；只有接近底部才跟随',()=>{expect(followTranscript(180)).toBe(false);expect(followTranscript(20)).toBe(true);});
