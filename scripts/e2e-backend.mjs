// Only Playwright's explicitly supplied new temporary database is initialized here.
import { resolve, relative, isAbsolute } from 'node:path';
import { initializeConfiguredDatabase } from '../dist/runtime.js';
const file = process.env.DATABASE_PATH;
if (!file) throw new Error('E2E_DATABASE_REQUIRED');
const within = relative(resolve('.tmp/stage-4b'), resolve(file));
if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('E2E_DATABASE_OUTSIDE_SCOPE');
await initializeConfiguredDatabase(file);
await import('../dist/server.js');
