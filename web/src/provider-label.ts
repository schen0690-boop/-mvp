import type {PublicProviders} from '../../src/app-providers.js';
// Historical test labels are display-only; normal mode is read from the backend.
export function providerLabel(config?:PublicProviders){
 if(config){const label=(p:string)=>p==='deepseek'?'DeepSeek':'Fake 演示（非真实模型）';return `阵容：${label(config.rosterProvider)}；讨论：${label(config.discussionProvider)}`;}
 return import.meta.env.VITE_DISCUSSION_DEMO==='live-short'?'阵容为本地预置；后续讨论内容由真实模型生成。':import.meta.env.VITE_DISCUSSION_DEMO==='local-http'?'真实适配器经本地 HTTP 替身验证':'Fake 演示 · 非真实模型';
}
