import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';

import type { ServerConfig } from '../config';
import * as schema from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseContext {
  readonly sqlite: Database.Database;
  readonly db: AppDatabase;
  close(): void;
}

export function openDatabase(config: ServerConfig): DatabaseContext {
  mkdirSync(path.dirname(config.databasePath), { recursive: true });

  const sqlite = new Database(config.databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('wal_autocheckpoint = 1000');

  const db = drizzle({ client: sqlite, schema });

  return {
    sqlite,
    db,
    close() {
      if (sqlite.open) sqlite.close();
    },
  };
}
