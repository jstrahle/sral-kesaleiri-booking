import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './db.ts';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/**
 * Yksinkertainen migraatioajuri: ajaa migrations/*.sql aakkosjarjestyksessa
 * kerran, kukin omassa transaktiossaan, ja kirjaa ajetut schema_migrations-tauluun.
 */
export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`migraatio ajettu: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migraatio ${file} epaonnistui: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
}

// Ajetaan suoraan kontin kaynnistyksessa: node dist/migrate.js
migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
