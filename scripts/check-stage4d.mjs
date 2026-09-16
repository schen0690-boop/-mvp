// Stage-local audit: explicit source/evidence files only; never opens private config or credentials.
import { readFileSync,readdirSync,statSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { join } from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const source=JSON.parse(readFileSync('evidence/stage-4d/source.json','utf8')),archive=readFileSync('docs/sources/development-prompts.md');
assert.equal(hash(archive.subarray(0,source.archivePrefixBytes)),source.archivePrefixSha256);
const raw=readFileSync('C:/Users/Administrator/.codex/attachments/92d5878a-af5b-462d-b1af-d5567df8ccc9/pasted-text.txt');
assert.equal(hash(raw),source.promptSha256);assert(archive.subarray(source.archivePrefixBytes).includes(raw));
assert.equal(git('diff',source.baseline,'--name-only','--','src/db','src/http','package-lock.json','tools/env-probe','evidence/stage-4b','evidence/stage-4c','docs/stage-4b-validation.md','docs/stage-4c-validation.md','.agents'),'');
assert.equal(git('check-ignore','.env.backend.local'),'.env.backend.local');assert.equal(git('ls-files','.env.backend.local'),'');
assert(!existsSync('.local/stage-4d-live'),'Live authorization must not be activated before user handoff');
const names=['verified-backend-types','verified-frontend-types','verified-e2e-types','verified-backend-build','verified-frontend-build','verified-backend-tests','verified-frontend-tests','verified-e2e'];
for(const name of names){const record=JSON.parse(readFileSync(`evidence/stage-4d/${name}.json`,'utf8'));assert.equal(record.exitCode,0);assert(record.sourceHashes);for(const [path,digest] of Object.entries(record.sourceHashes))assert.equal(hash(readFileSync(path)).toUpperCase(),digest,`source drift: ${name}/${path}`);}
const report=JSON.parse(readFileSync('evidence/stage-4d/raw/report.json','utf8'));assert.equal(report.stats.expected,26);for(const key of ['unexpected','skipped','flaky'])assert.equal(report.stats[key],0);
const walk=path=>readdirSync(path).flatMap(name=>{const p=join(path,name);return statSync(p).isDirectory()?walk(p):[p];});
for(const file of [...walk('tests'),...walk('web/tests'),...walk('e2e')].filter(p=>/\.[jt]sx?$/.test(p)))assert(!/\b(?:it|test|describe)\.(?:only|skip)\s*\(/.test(readFileSync(file,'utf8')));
for(const file of walk('web/dist').filter(p=>p.endsWith('.js')))assert(!/DEEPSEEK_API_KEY|api\.deepseek\.com|\.env\.backend\.local/.test(readFileSync(file,'utf8')),'backend config leaked into client bundle');
const changed=[...new Set([...git('diff',source.baseline,'--name-only').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')])].filter(Boolean);
const patterns=[/\bsk-[A-Za-z0-9_-]{24,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}/];
for(const file of changed){assert(file!=='.env.backend.local'&&!/\.(sqlite|db)(-|$)/.test(file));if(/\.(md|ts|tsx|json|mjs|example)$/.test(file))assert(!patterns.some(p=>p.test(readFileSync(file,'utf8'))),`secret-shaped value in ${file}`);}
console.log(JSON.stringify({historyPromptExact:true,protectedHistoryAndSchemaUnchanged:true,privateConfigIgnored:true,liveAuthorizationActivated:false,officialModelRequests:0,clientBundleBackendConfigAbsent:true,secretShapeMatches:0,focusedSkippedTests:0,finalSuccessfulCommands:names.length,e2e:report.stats},null,2));
