// This module is only imported by explicitly invoked backend configuration/live entry points.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { readRosterConfig,type RosterConfig } from './providers/config.js';
import { ProviderError } from './providers/roster.js';
export function loadBackendConfig(path='.env.backend.local'):RosterConfig {
  try {const raw=readFileSync(path,'utf8');if(Buffer.byteLength(raw)>32768)throw new Error();return readRosterConfig(parseEnv(raw));}
  catch {throw new ProviderError('configuration');}
}
