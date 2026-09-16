import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='evidence/stage-7';mkdirSync(root,{recursive:true});
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',maxBuffer:64*1024*1024});
const objects=git('rev-list','--objects','--all').trim().split('\n').map(s=>{const i=s.indexOf(' ');return {id:s.slice(0,i),path:s.slice(i+1)};}).filter(x=>/\.(?:md|ts|tsx|js|mjs|cjs|json|txt|html|css|yml|toml|ps1|py)$/.test(x.path));
const hits=[];for(const o of objects){const body=git('cat-file','blob',o.id);const lines=body.split('\n');for(let i=0;i<lines.length;i++)if(/sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[a-zA-Z0-9._-]{30,}/.test(lines[i]))hits.push({path:o.path,blob:o.id,line:i+1,type:'credential-shaped'});}
const tracked=git('ls-files').trim().split('\n');const privateTracked=tracked.filter(p=>/^\.local\/|^\.env(?:$|\.)/.test(p)&&!p.endsWith('.example'));
const sinks=[];for(const p of tracked.filter(p=>p.startsWith('web/src/')&&/\.(ts|tsx)$/.test(p))){readFileSync(p,'utf8').split('\n').forEach((s,i)=>{if(/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function|document\.write\(/.test(s))sinks.push({path:p,line:i+1});});}
const protectedBefore=JSON.parse(readFileSync('evidence/stage-6b-r1/protected-before.json','utf8'));const protectedPaths=[...Object.keys(protectedBefore),'.local/stage-6b-r1-once.json',...readdirSync('.local/stage-6b-r1/authorization').map(n=>'.local/stage-6b-r1/authorization/'+n),'.local/stage-6b-r1/discussions.sqlite'];
const hashes=Object.fromEntries(protectedPaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
if(!existsSync(root+'/protected-before.json'))writeFileSync(root+'/protected-before.json',JSON.stringify(hashes,null,2));
const old=JSON.parse(readFileSync(root+'/protected-before.json'));const changed=Object.keys(old).filter(p=>old[p]!==hashes[p]);
const result={checkedAt:new Date().toISOString(),historyTextBlobs:objects.length,credentialShapeHits:hits,privateTracked,dangerousFrontendSinks:sinks,protectedFiles:protectedPaths.length,changedProtected:changed,limitations:['Pattern scan is not a full security guarantee','No private config body was read','Synthetic fixture private markers are not proof of leaked reasoning']};
writeFileSync(root+'/security-scan.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(hits.length||privateTracked.length||changed.length)process.exitCode=1;
