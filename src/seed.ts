import {openConfiguredDatabase} from './runtime.js';
import {acquireDatabaseOwnership} from './db/ownership.js';
import {importSamples} from './import-samples.js';
let release=()=>{};
try{release=acquireDatabaseOwnership(process.env.DATABASE_PATH??'data/discussions.sqlite');const db=openConfiguredDatabase();try{console.log(JSON.stringify({source:'本地预置虚构阵容，非真实模型生成',discussionIds:importSamples(db)}));}finally{db.close();}}
catch{console.error('样例导入失败：请先初始化并停止该库的服务；已有数据不会被覆盖。');process.exitCode=1;}
finally{release();}
