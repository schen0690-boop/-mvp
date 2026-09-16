import type { DatabaseSync } from 'node:sqlite';
import { migrateDatabase } from './migrations.js';

/** Explicit initialization/migration; the HTTP listener only checks schema. */
export function initializeDatabase(db: DatabaseSync): void { migrateDatabase(db); }
