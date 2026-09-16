import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
const deadlineFix=process.argv.includes('--deadline-fix');
const backendOnly=process.argv.includes('--backend-only')||deadlineFix;
const e2eOnly=process.argv.includes('--e2e-only');
const root='evidence/stage-5b',raw=root+(deadlineFix?'/raw/deadline-fix':backendOnly?'/raw/final-backend':'/raw');mkdirSync(raw,{recursive:true});
const destination=root+(deadlineFix?'/verification-deadline-fix.json':backendOnly?'/verification-final-backend.json':e2eOnly?'/verification-final-e2e.json':'/verification.json');if(existsSync(destination))throw new Error('Existing verification evidence must not be overwritten');
const allCommands=[
 ['backend tests',['node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--reporter=default','--reporter=json','--outputFile='+raw+'/backend.json']],
 ['frontend tests',['node_modules/vitest/vitest.mjs','run','--config','web/vitest.config.ts','--reporter=default','--reporter=json','--outputFile='+raw+'/frontend.json']],
 ['backend typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.json']],
 ['frontend typecheck',['node_modules/typescript/bin/tsc','-p','web/tsconfig.json']],
 ['E2E typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.e2e.json']],
 ['backend build',['node_modules/typescript/bin/tsc','-p','tsconfig.build.json']],
 ['frontend build',['node_modules/vite/bin/vite.js','build','--config','web/vite.config.ts']],
 ['old lineup HTTP smoke',['scripts/http-smoke.mjs','--lineup']],
 ['old Fake browser E2E',['node_modules/playwright/cli.js','test','--config','playwright.stage5b.config.ts']]
];
const commands=backendOnly?allCommands.filter(([name])=>name==='backend tests'||name==='backend typecheck'||deadlineFix&&name==='backend build'):e2eOnly?allCommands.filter(([name])=>name==='E2E typecheck'||name==='old Fake browser E2E'):allCommands;
const report={stage:'5B',provider:'Fake discussion only; older adapter tests use injected transport/local stubs',codeRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),commands:[]};
for(const [name,args] of commands){
 console.log('Verifying: '+name);const startedAt=new Date().toISOString();let stdout='',stderr='';
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>{stdout+=data.toString();process.stdout.write(data);});child.stderr.on('data',data=>{stderr+=data.toString();process.stderr.write(data);});
  child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?128:1)));
 });
 report.commands.push({name,executable:process.execPath,args,startedAt,endedAt:new Date().toISOString(),exitCode:code,stdout,stderr});
 writeFileSync(destination,JSON.stringify(report,null,2)+'\n');if(code!==0){process.exitCode=code;break;}
}
if(report.commands.length===commands.length&&report.commands.every(c=>c.exitCode===0)){
 if(e2eOnly){report.results={e2e:JSON.parse(readFileSync(raw+'/e2e.json','utf8')).stats};report.completedAt=new Date().toISOString();writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log('RESULTS '+JSON.stringify(report.results));}
 else {
 const backend=JSON.parse(readFileSync(raw+'/backend.json','utf8'));
 const count=part=>backend.testResults.filter(f=>f.name.replaceAll('\\','/').includes('/tests/'+part+'/')).reduce((n,f)=>n+f.assertionResults.length,0);
 report.results={backend:backend.numPassedTests,backendUnit:count('unit'),backendIntegration:count('integration')};
 if(!backendOnly){const frontend=JSON.parse(readFileSync(raw+'/frontend.json','utf8')),e2e=JSON.parse(readFileSync(raw+'/e2e.json','utf8'));report.results.frontend=frontend.numPassedTests;report.results.e2e=e2e.stats;}
 report.completedAt=new Date().toISOString();
 writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log('RESULTS '+JSON.stringify(report.results));
 }
}
