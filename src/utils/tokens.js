import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign({ role: user.role }, env.jwtAccessSecret, {
    subject: user.id,
    expiresIn: `${env.accessTtlMinutes}m`,
    algorithm: 'HS256',
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.jwtAccessSecret, { algorithms: ['HS256'] });

// Refresh tokens are long random strings (not JWTs). Only their SHA-256 hash is stored.
export const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
export function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString('hex');
  return { raw, hash: hashToken(raw) };
}
