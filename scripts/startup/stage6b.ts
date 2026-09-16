import {launchStage6b} from './launch.js';
const flag=process.argv[2];
if(!['--local','--live','--r1'].includes(flag??'')||process.argv.length!==3)throw Error('Specify --local; --live requires a separately authorized unused prepared record');
try{await launchStage6b(flag==='--local'?'local':flag==='--r1'?'r1':'live');}
catch(error){console.error(error instanceof Error?`${error.name}: ${error.message}`:'UNKNOWN_STARTUP_ERROR');process.exitCode=1;}
