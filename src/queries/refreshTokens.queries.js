import { query } from '../db.js';

export async function insertRefreshToken({ userId, tokenHash, expiresAt }, client) {
  await client.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
}

export async function findRefreshTokenByHash(tokenHash) {
  const { rows } = await query(
    'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  return rows[0] ?? null;
}

// Returns true only if THIS call revoked it (protects against two parallel refreshes).
export async function revokeRefreshToken(id, client) {
  const { rowCount } = await client.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [id],
  );
  return rowCount === 1;
}

export async function revokeRefreshTokenByHash(tokenHash) {
  await query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash],
  );
}

export async function revokeAllForUser(userId) {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}
