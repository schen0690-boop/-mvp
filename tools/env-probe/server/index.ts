import express from 'express';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Generic environment endpoint only. No business API, model calls or secrets.
const app = express();
app.get('/probe/health', (_request, response) => {
  response.json({ ok: true, message: '本地后端已连接' });
});
const evidence = join(process.cwd(), 'evidence');
mkdirSync(evidence, { recursive: true });
const server = app.listen(41732, '127.0.0.1', () => {
  const record = { event: 'probe-server-started', pid: process.pid, host: '127.0.0.1', port: 41732 };
  appendFileSync(join(evidence, 'service-processes.jsonl'), JSON.stringify(record) + '\n');
  console.log(JSON.stringify(record));
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(JSON.stringify({ event: 'probe-server-error', code: error.code }));
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
