import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const child = spawn(process.execPath, ['dist/server/index.js'], { cwd: process.cwd(), windowsHide: true });
let log = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
const exited = once(child, 'exit');
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server readiness timed out')), 10000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited ${code} before ready`)); });
    child.stderr.on('data', (text) => { log += text; });
    child.stdout.on('data', (text) => {
      log += text;
      if (log.includes('probe-server-started')) { clearTimeout(timeout); resolve(); }
    });
  });
  const response = await fetch('http://127.0.0.1:41732/probe/health', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, message: '本地后端已连接' });
  console.log(JSON.stringify({ status: response.status, body, ownedServerPid: child.pid }));
} finally {
  if (child.exitCode === null) child.kill();
  await exited;
  console.log(JSON.stringify({ ownedServerStopped: true, serverOutput: log }));
}
