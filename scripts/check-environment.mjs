// @ts-check
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {nodeVersionIssue,browserOptions} from './reviewer-tools.mjs';

async function main(){
 const args=process.argv.slice(2);
 if(args.some(a=>!['--dependencies','--browser'].includes(a)))throw Error('参数仅支持 --dependencies 或 --browser。');
 const issue=nodeVersionIssue(process.versions.node);
 if(issue)throw Error(issue);
 console.log(`Node ${process.versions.node} (${process.platform}/${process.arch})：版本符合项目要求。`);
 try{
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(':memory:');
  try{db.exec('CREATE TABLE probe(value TEXT NOT NULL)');db.prepare('INSERT INTO probe VALUES (?)').run('本机检查');if(db.prepare('SELECT value FROM probe').get()?.value!=='本机检查')throw Error();}
  finally{db.close();}
 }catch{throw Error('node:sqlite 内存读写检查失败；请确认使用官方支持平台上的指定 Node 版本。');}
 console.log('SQLite：内存读写通过，未打开应用数据库。');
 if(args.includes('--dependencies')||args.includes('--browser')){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const result=spawnSync(process.execPath,[resolve(root,'scripts/check-dependencies.mjs')],{cwd:root,encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error('项目依赖或锁文件核对失败。请在项目根目录执行 npm ci --ignore-scripts --no-audit --no-fund；仍失败时运行 node scripts/check-dependencies.mjs 查看具体原因。');
  console.log('依赖：已安装的精确版本与锁文件一致。');
 }
 if(args.includes('--browser')){
  const options=browserOptions(process.env.E2E_BROWSER);
  const {chromium}=await import('@playwright/test');
  try{
   const browser=await chromium.launch({...options,headless:true});
   try{console.log(`浏览器：${process.env.E2E_BROWSER||'chromium'} ${browser.version()} 启动成功（未访问网页）。`);}
   finally{await browser.close();}
  }catch{throw Error(options.channel?`无法启动 ${options.channel}：请安装该浏览器，或改用默认 Chromium。`:'无法启动 Chromium：先运行 node node_modules/playwright/cli.js install chromium；Linux 请参考 README 安装浏览器系统依赖。请同时核对 Playwright 的系统支持要求。');}
 }
 console.log('检查完成；未加载私有配置，未请求模型。环境检查不代表产品测试或跨平台认证。');
}
main().catch(error=>{console.error(`环境检查未通过：${error instanceof Error?error.message:'未知本地检查错误'}`);process.exitCode=1;});
