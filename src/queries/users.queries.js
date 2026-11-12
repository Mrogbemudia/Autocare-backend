import { query } from '../db.js';

// Login needs password_hash. Never put it in a response.
export async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, password_hash, full_name, phone, role, is_active
       FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const { rows } = await query(
    'SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function insertUser({ email, passwordHash, fullName, phone, role }, client) {
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, full_name, phone, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, full_name, phone, role`,
    [email, passwordHash, fullName, phone, role],
  );
  return rows[0];
}

export async function updateUserPhone(userId, phone, client) {
  await client.query('UPDATE users SET phone = $2, updated_at = now() WHERE id = $1', [userId, phone]);
}
