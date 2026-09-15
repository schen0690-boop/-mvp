import { spawnSync } from 'node:child_process';

// Intentional runner failure; no parent environment mutation, no business TDD claim.
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'], {
  cwd: process.cwd(), env: { ...process.env, ENV_PROBE_NEGATIVE: '1' },
  encoding: 'utf8', timeout: 60000, windowsHide: true,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
console.log(JSON.stringify({ intentionalNegativeSelfCheck: true, actualExitCode: result.status }));
process.exitCode = result.status ?? 1;
