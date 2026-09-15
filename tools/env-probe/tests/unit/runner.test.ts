import { expect, test } from 'vitest';

test('runner reports assertions (negative mode is a tool self-check only)', () => {
  // Only the explicitly invoked child process sets this flag. Normal runs expect 4.
  expect(2 + 2).toBe(process.env.ENV_PROBE_NEGATIVE === '1' ? 5 : 4);
});
