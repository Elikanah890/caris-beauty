import knex, { type Knex } from 'knex';
import pg from 'pg';
import { databaseUrl } from './env';
import { preferIpv4 } from './db/net';
import { connectionStringWithoutSslMode, resolveSslConfig } from './db/ssl';

preferIpv4();

pg.types.setTypeParser(20, (value: string) => Number(value));

export const db: Knex = knex({
  client: 'pg',
  connection: {
    connectionString: connectionStringWithoutSslMode(databaseUrl),
    ssl: resolveSslConfig(databaseUrl)
  },
  pool: { min: 0, max: 10 },
  acquireConnectionTimeout: 10_000
});

export type Db = Knex | Knex.Transaction;
