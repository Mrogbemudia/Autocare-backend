// Creates the admin user. Credentials come from environment variables, never from Git.
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const phone = process.env.ADMIN_PHONE ?? '+2348000000000';

async function run() {
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  const hash = await bcrypt.hash(password, 12);
  const { rowCount } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, phone, role)
     VALUES ($1, $2, 'Kaza Admin', $3, 'admin')
     ON CONFLICT (lower(email)) DO NOTHING`,
    [email, hash, phone],
  );
  console.log(rowCount ? `Admin created: ${email}` : `Admin already exists: ${email}`);
  await pool.end();
}

run().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
