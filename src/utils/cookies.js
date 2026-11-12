import { env } from '../config/env.js';

const base = { httpOnly: true, secure: env.isProd, sameSite: 'lax' };
const ACCESS = { ...base, path: '/' };
const REFRESH = { ...base, path: '/api/auth' }; // only sent to auth endpoints

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('access_token', accessToken, { ...ACCESS, maxAge: env.accessTtlMinutes * 60_000 });
  res.cookie('refresh_token', refreshToken, { ...REFRESH, maxAge: env.refreshTtlDays * 86_400_000 });
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', ACCESS);
  res.clearCookie('refresh_token', REFRESH);
}
