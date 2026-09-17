// Delivery-only local renderer. Application dependencies and lockfiles are never changed.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {resolve,join,relative,extname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const rendererRoot=resolve(process.argv[2]??'');
const manifest=JSON.parse(readFileSync(join(rendererRoot,'node_modules/mermaid/package.json')));
if(manifest.name!=='mermaid'||manifest.version!=='11.12.0')throw Error('Expected isolated official mermaid@11.12.0');
const dist=join(rendererRoot,'node_modules/mermaid/dist');
const output='evidence/stage-7/closure/diagrams',previews=join(rendererRoot,'previews');
mkdirSync(output,{recursive:true});mkdirSync(previews,{recursive:true});
const sources=['docs/architecture.md','docs/discussion-runtime-design.md','docs/lineup-design.md'];
const diagrams=[];
for(const file of sources){const text=readFileSync(file,'utf8');let ordinal=0;for(const m of text.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)){const before=text.slice(0,m.index);diagrams.push({file,line:before.split('\n').length,title:[...before.matchAll(/^#{1,6} (.+)$/gm)].at(-1)?.[1].trim(),id:file.split('/').at(-1).replace('.md','')+'-'+(++ordinal),type:m[1].trim().split(/\s/)[0],source:m[1].trim()});}}
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{margin:24px;background:white;font-family:"Microsoft YaHei",sans-serif}#diagram{display:inline-block}svg{max-width:none!important}</style><div id="diagram"></div><script type="module">import mermaid from "/mermaid.esm.min.mjs";mermaid.initialize({startOnLoad:false,securityLevel:"strict",fontFamily:"Microsoft YaHei, sans-serif",theme:"default"});window.diagramRenderer=mermaid;</script></html>';
const server=createServer((req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}const path=resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname)),rel=relative(dist,path);if(rel.startsWith('..')||isAbsolute(rel)||!statSync(path).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',extname(path)==='.mjs'?'text/javascript':'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
const address=server.address();if(!address||typeof address==='string')throw Error('Invalid local address');
const report={startedAt:new Date().toISOString(),renderer:manifest.version,rendererRoot,source:'https://github.com/mermaid-js/mermaid',license:manifest.license,port:address.port,diagrams:[],blockedRequests:[],browserClosed:false,serverClosed:false};
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});report.browserVersion=browser.version();
 const context=await browser.newContext({viewport:{width:1800,height:1200}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'&&url.port===String(address.port))return route.continue();report.blockedRequests.push(url.origin);return route.abort();});
 const page=await context.newPage();await page.goto('http://127.0.0.1:'+address.port);await page.waitForFunction(()=>Boolean(window.diagramRenderer));
 for(const d of diagrams){const row={file:d.file,line:d.line,title:d.title,id:d.id,type:d.type,sourceSha256:createHash('sha256').update(d.source).digest('hex')};
  try{const result=await page.evaluate(async({id,source})=>{await document.fonts.ready;const parsed=await window.diagramRenderer.parse(source);const {svg}=await window.diagramRenderer.render(id,source);document.querySelector('#diagram').innerHTML=svg;const root=document.querySelector('#diagram svg'),vb=root.viewBox.baseVal;root.style.width=Math.ceil(vb.width)+'px';root.style.height=Math.ceil(vb.height)+'px';await document.fonts.ready;const rect=root.getBoundingClientRect();const outside=[...root.querySelectorAll('text,foreignObject')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&(r.x<rect.x-2||r.y<rect.y-2||r.right>rect.right+2||r.bottom>rect.bottom+2);}).map(el=>el.textContent.trim());return {svg,width:Math.ceil(vb.width),height:Math.ceil(vb.height),outside,visibleText:root.textContent,parsedType:parsed.diagramType};},{id:d.id,source:d.source});
   writeFileSync(join(output,d.id+'.svg'),result.svg);await page.setViewportSize({width:Math.max(1000,result.width+48),height:Math.max(600,result.height+48)});await page.locator('#diagram').screenshot({path:join(previews,d.id+'.png')});
   report.diagrams.push({...row,status:'rendered',width:result.width,height:result.height,outOfBoundsLabels:result.outside,svg:output+'/'+d.id+'.svg',preview:join(previews,d.id+'.png'),parsedType:result.parsedType});
  }catch(error){report.diagrams.push({...row,status:'failed',error:String(error)});process.exitCode=1;}
 }
}finally{if(browser){await browser.close();report.browserClosed=true;}await new Promise(ok=>server.close(ok));report.serverClosed=true;report.finishedAt=new Date().toISOString();writeFileSync('evidence/stage-7/closure/render-results.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
