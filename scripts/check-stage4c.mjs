// Read-only scope/source check. Never reads .env, credentials or user databases.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const source=JSON.parse(readFileSync('evidence/stage-4c/source.json','utf8'));
const archive=readFileSync('docs/sources/development-prompts.md');
assert.equal(hash(archive.subarray(0,source.archivePrefixBytes)),source.archivePrefixSha256);
const original=readFileSync('C:/Users/Administrator/.codex/attachments/0ea0066c-c373-446a-a1ed-a76141e232b9/pasted-text.txt');
assert.equal(hash(original),source.promptSha256);assert(archive.subarray(source.archivePrefixBytes).includes(original));
const protectedPaths=['src','tests','package.json','package-lock.json','tools/env-probe','evidence/stage-2','evidence/stage-3','evidence/stage-4b','docs/stage-2-validation.md','docs/stage-3-validation.md','docs/stage-4b-validation.md','.agents'];
assert.equal(git('diff',source.baseline,'--name-only','--',...protectedPaths),'');
const walk=folder=>readdirSync(folder).flatMap(name=>{const path=join(folder,name);return statSync(path).isDirectory()?walk(path):[path];});
const testFiles=[...walk('web/tests'),...walk('e2e')].filter(p=>/\.[jt]sx?$/.test(p));
for(const file of testFiles)assert(!/\b(?:it|test|describe)\.(?:only|skip)\s*\(/.test(readFileSync(file,'utf8')),`focused/skipped ${file}`);
const changed=[...new Set([...git('diff',source.baseline,'--name-only').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')])].filter(Boolean);
const secrets=[/\bsk-[A-Za-z0-9_-]{24,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}/];
let scanned=0;
for(const file of changed){
  assert(!/(?:^|\/)\.env(?:\.|$)|\.(?:sqlite|sqlite3|db)(?:-|$)/.test(file),`private artifact ${file}`);
  if(/\.(?:md|json|mjs|ts|tsx|css)$/.test(file)){const content=readFileSync(file,'utf8');assert(!secrets.some(pattern=>pattern.test(content)),`secret-shaped content in ${file}`);scanned++;}
}
const records=['final-backend-types','final-frontend-types','final-e2e-types','final-backend-build','final-frontend-build','final-backend-tests','final-frontend-tests','final-e2e'];
for(const name of records){const record=JSON.parse(readFileSync(`evidence/stage-4c/${name}.json`,'utf8'));assert.equal(record.exitCode,0);for(const [path,digest] of Object.entries(record.sourceHashes??{}))assert.equal(hash(readFileSync(path)).toUpperCase(),digest,`source drift: ${name}/${path}`);}
const report=JSON.parse(readFileSync('evidence/stage-4c/raw/report.json','utf8'));assert.equal(report.stats.expected,26);assert.equal(report.stats.unexpected,0);assert.equal(report.stats.skipped,0);assert.equal(report.stats.flaky,0);
console.log(JSON.stringify({promptPrefixUnchanged:true,promptExact:true,protectedPathsUnchanged:true,sensitiveShapeMatches:0,scannedTextFiles:scanned,focusedOrSkippedTests:0,finalCommands:records.length,e2e:report.stats,screenshots:walk('evidence/stage-4c/screenshots').length},null,2));
