import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const tmpRoot = resolve('.tmp/stage-2');
mkdirSync(tmpRoot, { recursive: true });
const databasePath = join(mkdtempSync(join(tmpRoot, 'smoke-')), 'smoke.sqlite');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const address = reservation.address();
assert(address && typeof address === 'object');
const port = address.port;
await new Promise(resolve => reservation.close(resolve));
const env = { ...process.env, DATABASE_PATH: databasePath, PORT: String(port) };
const base = `http://127.0.0.1:${port}`;
const childRuns = [];
function initialize() {
  const result = spawnSync(process.execPath, ['dist/init-db.js'], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return { exitCode: result.status, output: result.stdout.trim() };
}
async function start() {
  const child = fork(resolve('scripts/smoke-child.mjs'), [], { env, silent: true, windowsHide: true });
  let output = '';
  let errorOutput = '';
  const exit = once(child, 'exit');
  child.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup readiness timed out')), 10000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes(`http://127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Service exited before readiness: ${code}`)); });
  }).catch(error => { child.kill(); throw error; });
  return {
    async stop() {
      const timer = setTimeout(() => child.kill(), 10000);
      child.send('shutdown');
      const [code, signal] = await exit;
      clearTimeout(timer);
      childRuns.push({ pid: child.pid, exitCode: code, signal, output: output.trim(), stderr: errorOutput.trim() });
      assert.equal(code, 0, 'Service must shut down normally');
    }
  };
}
const initialization = [initialize()];
const first = await start();
let created;
const statuses = {};
try {
  const response = await fetch(`${base}/api/discussions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: '独立进程：中文持久化与"查询"', requestId: randomUUID() })
  });
  statuses.create = response.status;
  assert.equal(response.status, 201);
  created = await response.json();
  assert.equal(created.snapshot.status, 'created');
  const responseGet = await fetch(`${base}/api/discussions/${created.discussionId}`);
  statuses.get = responseGet.status;
  assert.equal(responseGet.status, 200);
  assert.deepEqual(await responseGet.json(), created.snapshot);
  const responseList = await fetch(`${base}/api/discussions?status=all`);
  statuses.list = responseList.status;
  assert.equal(responseList.status, 200);
  assert.equal((await responseList.json()).items.length, 1);
} finally { await first.stop(); }
initialization.push(initialize());
const second = await start();
try {
  const response = await fetch(`${base}/api/discussions/${created.discussionId}`);
  statuses.reopenedGet = response.status;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), created.snapshot);
} finally { await second.stop(); }
await assert.rejects(fetch(`${base}/api/discussions`, { signal: AbortSignal.timeout(3000) }));
console.log(JSON.stringify({ initialization, statuses, childRuns, listenerClosed: true,
  databaseScope: '.tmp/stage-2/smoke-* (独立新建文件，保留，不触碰开发库)' }, null, 2));
