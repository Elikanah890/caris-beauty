import knex, { type Knex } from 'knex';
import pg from 'pg';
import { databaseUrl, env } from './env';

pg.types.setTypeParser(20, (value: string) => Number(value));

export const db: Knex = knex({
  client: 'pg',
  connection: {
    connectionString: databaseUrl,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  pool: { min: 0, max: 10 },
  acquireConnectionTimeout: 10_000
});

export type Db = Knex | Knex.Transaction;
