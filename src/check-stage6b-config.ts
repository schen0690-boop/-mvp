import {loadStage6bConfig} from './live/stage6b-config.js';
import {stage6bSettings} from './live/stage6b-settings.js';
try{loadStage6bConfig();console.log(JSON.stringify({provider:'deepseek',...stage6bSettings,key:'密钥已配置'}));}
catch{console.error('6B配置不可用：请在项目.env.backend.local本地检查密钥及固定模型设置，不要发送密钥。');process.exitCode=1;}
