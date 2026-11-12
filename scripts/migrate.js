import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');

    const client = await pool.connect(); // a transaction must stay on ONE connection
    try {
      await client.query('BEGIN');
      await client.query(sql); // no params => several statements allowed
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file}: ${err.message}`);
    } finally {
      client.release(); // always give the connection back, even after an error
    }
  }
  console.log(count ? `Done. ${count} migration(s) applied.` : 'Database is up to date.');
  await pool.end();
}

run().catch(async (err) => {
  console.error('Migration failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
