import {useEffect,useState} from 'react';
import {providerLabel} from './provider-label.js';
export function useProviderLabel(){
 const special=['live-short','local-http'].includes(import.meta.env.VITE_DISCUSSION_DEMO??'');
 const [label,setLabel]=useState(special?providerLabel():'正在读取运行模式…');
 useEffect(()=>{if(special)return;const controller=new AbortController();let active=true;
 void fetch('/api/config',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const c:unknown=await r.json();if(!c||typeof c!=='object'||!('rosterProvider' in c)||!('discussionProvider' in c)||Object.keys(c).length!==2)throw Error();const a=c.rosterProvider,b=c.discussionProvider;if((a!=='fake'&&a!=='deepseek')||(b!=='fake'&&b!=='deepseek'))throw Error();if(active)setLabel(providerLabel({rosterProvider:a,discussionProvider:b}));}).catch(()=>{if(active)setLabel('运行模式暂不可用，请检查后端配置');});
 return()=>{active=false;controller.abort();};},[special]);return label;
}
