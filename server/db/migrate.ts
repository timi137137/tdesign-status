import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { loadConfig } from '../config';
import { type DatabaseContext, openDatabase } from './client';

export function applyMigrations(context: DatabaseContext, migrationsFolder: string): void {
  migrate(context.db, { migrationsFolder });
}

function main(): void {
  const config = loadConfig();
  const context = openDatabase(config);
  try {
    applyMigrations(context, config.migrationsPath);
    process.stdout.write(`数据库迁移完成：${config.databasePath}\n`);
  } finally {
    context.close();
  }
}

if (require.main === module) {
  main();
}
