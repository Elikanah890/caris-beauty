import knex, { type Knex } from 'knex';
import pg from 'pg';
import { databaseUrl } from './env';

pg.types.setTypeParser(20, (value: string) => Number(value));

// Render Postgres requires SSL. Local Postgres does not.
const useSsl = /render\.com/i.test(databaseUrl);

export const db: Knex = knex({
  client: 'pg',
  connection: {
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  },
  pool: { min: 0, max: 10 },
  acquireConnectionTimeout: 10_000
});

export type Db = Knex | Knex.Transaction;
