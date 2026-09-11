import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.STATUS_DB_PATH || './server/data/status.db',
  },
  strict: true,
  verbose: true,
});
