import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const root='evidence/stage-6b',stamp=new Date().toISOString().replaceAll(':','-'),raw=root+'/raw';
mkdirSync(raw,{recursive:true});
const destination=`${root}/verification-${stamp}.json`;
const commands=[
 ['backend tests',['node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--reporter=default','--reporter=json','--outputFile='+raw+'/backend.json']],
 ['frontend tests',['node_modules/vitest/vitest.mjs','run','--config','web/vitest.config.ts','--reporter=default','--reporter=json','--outputFile='+raw+'/frontend.json']],
 ['backend typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.json']],
 ['frontend typecheck',['node_modules/typescript/bin/tsc','-p','web/tsconfig.json']],
 ['E2E typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.e2e.json']],
 ['backend build',['node_modules/typescript/bin/tsc','-p','tsconfig.build.json']],
 ['frontend build',['node_modules/vite/bin/vite.js','build','--config','web/vite.config.ts']],
 ['lineup HTTP smoke',['scripts/http-smoke.mjs','--lineup']],
 ['old and new Fake browser E2E',['node_modules/playwright/cli.js','test','--config','playwright.stage5c.config.ts']],
 ['local HTTP adapter browser E2E',['node_modules/playwright/cli.js','test','--config','playwright.stage6a.config.ts']],
 ['short protected local HTTP browser dry run',['scripts/stage6b-dry-run.mjs']]
];
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const report={stage:'6B-preflight',provider:'Real discussion adapter via local HTTP only; default regression Fake',officialRequests:0,codeRevision:git(['rev-parse','HEAD']),workingChanges:git(['status','--short']),startedAt:new Date().toISOString(),commands:[]};
for(const [name,args] of commands){
 console.log('Verifying: '+name);const startedAt=new Date().toISOString();let stdout='',stderr='';
 const exitCode=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,E2E_EVIDENCE_ROOT:'evidence/stage-6b',E2E_LOCAL_EVIDENCE_ROOT:'evidence/stage-6b'}});
  child.stdout.on('data',data=>{stdout+=data.toString();process.stdout.write(data);});
  child.stderr.on('data',data=>{stderr+=data.toString();process.stderr.write(data);});
  child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?128:1)));
 });
 report.commands.push({name,executable:process.execPath,args,startedAt,endedAt:new Date().toISOString(),exitCode,stdout,stderr});
 writeFileSync(destination,JSON.stringify(report,null,2)+'\n');if(exitCode!==0){process.exitCode=exitCode;break;}
}
if(report.commands.length===commands.length&&report.commands.every(c=>c.exitCode===0)){
 const backend=JSON.parse(readFileSync(raw+'/backend.json','utf8')),frontend=JSON.parse(readFileSync(raw+'/frontend.json','utf8')),e2e=JSON.parse(readFileSync(raw+'/e2e.json','utf8'));
 const count=part=>backend.testResults.filter(f=>f.name.replaceAll('\\','/').includes('/tests/'+part+'/')).reduce((n,f)=>n+f.assertionResults.length,0);
 report.results={backend:backend.numPassedTests,backendUnit:count('unit'),backendIntegration:count('integration'),backendPending:backend.numPendingTests,frontend:frontend.numPassedTests,frontendPending:frontend.numPendingTests,e2e:e2e.stats,localAdapterE2E:JSON.parse(readFileSync(raw+'/local-e2e.json','utf8')).stats};
 report.completedAt=new Date().toISOString();writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log('RESULTS '+JSON.stringify(report.results));
}
console.log('Evidence: '+destination);
