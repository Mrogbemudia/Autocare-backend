import bcrypt from 'bcryptjs';
import { withTransaction } from '../db.js';
import { env } from '../config/env.js';
import { badRequest, conflict, unauthorized } from '../utils/httpError.js';
import { signAccessToken, generateRefreshToken, hashToken } from '../utils/tokens.js';
import * as users from '../queries/users.queries.js';
import * as refresh from '../queries/refreshTokens.queries.js';
import * as shops from '../queries/shops.queries.js';

const ROUNDS = 12;
// Compared against when the email is unknown, so login takes about the same time either way.
const DUMMY_HASH = bcrypt.hashSync('kaza-dummy-password', ROUNDS);

const isUnique = (err, constraint) => err?.code === '23505' && err.constraint === constraint;

export const toPublicUser = (u) => ({
  id: u.id, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role,
}); // password_hash is never included

const toShopSummary = (s) => s && ({
  id: s.id, businessName: s.business_name, verificationStatus: s.verification_status,
  verificationNote: s.verification_note,
});

async function startSession(user, client) {
  const { raw, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.refreshTtlDays * 86_400_000);
  await refresh.insertRefreshToken({ userId: user.id, tokenHash: hash, expiresAt }, client);
  return { accessToken: signAccessToken(user), refreshToken: raw };
}

export async function registerOwner(input) {
  const passwordHash = await bcrypt.hash(input.password, ROUNDS);
  try {
    return await withTransaction(async (client) => {
      const user = await users.insertUser({ ...input, passwordHash, role: 'owner' }, client);
      return { user: toPublicUser(user), session: await startSession(user, client) };
    });
  } catch (err) {
    if (isUnique(err, 'users_email_unique')) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
    throw err;
  }
}

export async function registerShop(input) {
  const passwordHash = await bcrypt.hash(input.password, ROUNDS);
  try {
    return await withTransaction(async (client) => {
      const types = await shops.findServiceTypesByCodes(input.serviceCodes, client);
      if (types.length !== new Set(input.serviceCodes).size) {
        throw badRequest('One or more service types are not recognised', 'UNKNOWN_SERVICE_TYPE');
      }
      const user = await users.insertUser({ ...input, passwordHash, role: 'shop' }, client);
      const shop = await shops.insertShop({ ...input, userId: user.id }, client);
      await shops.replaceShopServices(shop.id, types.map((t) => t.id), client);
      const session = await startSession(user, client);
      return {
        user: toPublicUser(user),
        shop: { id: shop.id, businessName: input.businessName, verificationStatus: 'pending' },
        session,
      };
    });
  } catch (err) {
    if (isUnique(err, 'users_email_unique')) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
    throw err;
  }
}

export async function login({ email, password }) {
  const user = await users.findUserByEmail(email);
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk || !user.is_active) {
    throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  const session = await withTransaction((client) => startSession(user, client));
  const shop = user.role === 'shop' ? toShopSummary(await shops.findShopByUserId(user.id)) : undefined;
  return { user: toPublicUser(user), shop, session };
}

export async function refreshSession(rawToken) {
  if (!rawToken) throw unauthorized('Session expired', 'REFRESH_INVALID');
  const row = await refresh.findRefreshTokenByHash(hashToken(rawToken));
  if (!row) throw unauthorized('Session expired', 'REFRESH_INVALID');
  if (row.revoked_at) {
    // A revoked token was presented again: it may have been stolen. End all sessions for this user.
    await refresh.revokeAllForUser(row.user_id);
    throw unauthorized('Session expired', 'REFRESH_INVALID');
  }
  if (new Date(row.expires_at) <= new Date()) throw unauthorized('Session expired', 'REFRESH_INVALID');

  const user = await users.findUserById(row.user_id);
  if (!user?.is_active) throw unauthorized('Session expired', 'REFRESH_INVALID');

  return withTransaction(async (client) => {
    const revoked = await refresh.revokeRefreshToken(row.id, client); // rotation: old token dies
    if (!revoked) throw unauthorized('Session expired', 'REFRESH_INVALID');
    return { user: toPublicUser(user), session: await startSession(user, client) };
  });
}

export async function logout(rawToken) {
  if (rawToken) await refresh.revokeRefreshTokenByHash(hashToken(rawToken));
}

export async function getMe(user) {
  const shop = user.role === 'shop' ? toShopSummary(await shops.findShopByUserId(user.id)) : undefined;
  return { user: toPublicUser(user), shop };
}
