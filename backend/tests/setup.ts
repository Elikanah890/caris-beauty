import 'dotenv/config';

process.env.NODE_ENV = 'test';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run backend tests');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef';
process.env.COOKIE_SECURE = 'false';

import { afterAll, beforeAll } from 'vitest';
import knex from 'knex';

const connectionString = process.env.DATABASE_URL as string;

beforeAll(async () => {
  const admin = knex({ client: 'pg', connection: { connectionString }, pool: { min: 0, max: 1 } });
  try {
    await admin.raw('DROP SCHEMA IF EXISTS public CASCADE');
    await admin.raw('CREATE SCHEMA public');
    await admin.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await admin.raw('CREATE EXTENSION IF NOT EXISTS citext');
  } finally {
    await admin.destroy();
  }
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations(connectionString);
});

afterAll(async () => {
  const { db } = await import('../src/db');
  await db.destroy();
});
