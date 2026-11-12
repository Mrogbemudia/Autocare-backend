import app from './app.js';
import { env } from './config/env.js';
import { pool } from './db.js';

const server = app.listen(env.port, () => console.log(`Kaza API listening on :${env.port} (${env.nodeEnv})`));

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
