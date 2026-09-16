// Compatibility command: compile and execute the exact shared, typed launcher.
import {spawnSync} from 'node:child_process';
const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.startup.json'],{windowsHide:true,stdio:'inherit'});
if(build.status!==0)process.exitCode=build.status??1;
else{const run=spawnSync(process.execPath,['.cache/startup/scripts/startup/stage6b.js','--local'],{windowsHide:true,stdio:'inherit'});process.exitCode=run.status??1;}
