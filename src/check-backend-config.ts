import { loadBackendConfig } from './backend-config.js';
try {const config=loadBackendConfig();console.log(config.provider==='deepseek'?'密钥已配置':'密钥未配置');}
catch {console.log('密钥未配置');process.exitCode=1;}
