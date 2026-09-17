import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

it('checks Node and SQLite before dependencies are installed without reading a key',()=>{
 const result=spawnSync(process.execPath,['scripts/check-environment.mjs'],{encoding:'utf8',env:{...process.env,DEEPSEEK_API_KEY:'test-only-do-not-print'},windowsHide:true});
 expect(result.status).toBe(0);expect(result.stdout).toContain('未请求模型');expect(result.stdout+result.stderr).not.toContain('test-only-do-not-print');
});
it('missing dependencies give an actionable install command',()=>{
 const root=mkdtempSync(join(tmpdir(),'roundtable-reviewer-'));
 try{
  mkdirSync(join(root,'scripts'));
  for(const file of ['check-environment.mjs','reviewer-tools.mjs','check-dependencies.mjs'])copyFileSync(resolve('scripts',file),join(root,'scripts',file));
  const result=spawnSync(process.execPath,[join(root,'scripts/check-environment.mjs'),'--dependencies'],{cwd:root,encoding:'utf8',windowsHide:true});
  expect(result.status).toBe(1);expect(result.stderr).toContain('npm ci --ignore-scripts');expect(result.stderr).not.toContain(' at ');
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('unknown checker arguments fail explicitly',()=>{
 const result=spawnSync(process.execPath,['scripts/check-environment.mjs','--unknown'],{encoding:'utf8',windowsHide:true});
 expect(result.status).toBe(1);expect(result.stderr).toContain('参数仅支持');
});
