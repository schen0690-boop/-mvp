// Checks inline relative links in the current delivery documents against Git paths.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
const files=['README.md','docs/requirements.md','docs/architecture.md','docs/contracts.md','docs/test-plan.md','docs/ui-spec.md','docs/lineup-design.md','docs/discussion-runtime-design.md','docs/workflow.md','docs/delivery-validation.md'];
const tracked=new Set(execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean));
const slug=s=>s.toLowerCase().replace(/<[^>]*>/g,'').replace(/[`*]/g,'').replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu,'').replace(/\s/g,'-');
const records=[];
for(const file of files){const text=readFileSync(file,'utf8').replace(/```[\s\S]*?```/g,'');for(const m of text.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)){const url=m[2];if(/^[a-z]+:\/\//i.test(url))continue;const [path,anchor]=url.split('#'),target=relative(process.cwd(),resolve(dirname(file),decodeURIComponent(path||file.split('/').at(-1)))).replaceAll('\\','/');const trackedPath=tracked.has(target)||[...tracked].some(p=>p.startsWith(target+'/'));let anchorExists=true;if(anchor&&existsSync(target)){const body=readFileSync(target,'utf8').replace(/```[\s\S]*?```/g,'');const heads=[...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(x=>slug(x[1].trim()));anchorExists=heads.includes(decodeURIComponent(anchor));}records.push({file,label:m[1],url,target,tracked:trackedPath,exists:existsSync(target),anchorExists});}}
const failures=records.filter(x=>!x.tracked||!x.exists||!x.anchorExists);writeFileSync('evidence/stage-7/closure/links.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:files,records,failures,externalLinks:'Not fetched; GitHub/Gitee rendering and reviewer access unverified'},null,2));console.log(JSON.stringify({count:records.length,failures}));if(failures.length)process.exitCode=1;
