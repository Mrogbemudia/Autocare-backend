import pg from 'pg';
import { env } from './config/env.js';

// BIGINT (int8) and COUNT(*) come back as strings by default. Kobo amounts stay far below
// Number.MAX_SAFE_INTEGER (about 9e15), so we parse them as numbers.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl, // Neon's URL contains sslmode=require
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
pool.on('error', (err) => console.error('Unexpected pg pool error:', err.message));

// Values ALWAYS go in `params`, never into the SQL text.
export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
