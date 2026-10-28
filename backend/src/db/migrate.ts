import fs from 'node:fs/promises';
import path from 'node:path';
import knex from 'knex';
import { databaseUrl } from '../env';
import { logger } from '../logger';

export async function runMigrations(connectionString = databaseUrl): Promise<void> {
  const useSsl = /render\.com/i.test(connectionString);
  const instance = knex({
    client: 'pg',
    connection: {
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : false
    },
    pool: { min: 0, max: 2 }
  });

  try {
    await instance.raw(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        run_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const dir = path.resolve(__dirname, '../../migrations');
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const appliedRows = (await instance('schema_migrations').select('filename')) as Array<{
      filename: string;
    }>;
    const applied = new Set(appliedRows.map((r) => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        logger.info({ file }, 'skip migration');
        continue;
      }
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await instance.transaction(async (trx) => {
        await trx.raw(sql);
        await trx('schema_migrations').insert({ filename: file });
      });
      logger.info({ file }, 'apply migration');
    }
    logger.info('Migrations complete');
  } finally {
    await instance.destroy();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
