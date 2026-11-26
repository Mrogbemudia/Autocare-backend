import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/respond.js';
import { clearAuthCookies, setAuthCookies } from '../utils/cookies.js';
import * as auth from '../services/auth.service.js';

export const registerOwner = asyncHandler(async (req, res) => {
  const { user, session } = await auth.registerOwner(req.body);
  setAuthCookies(res, session);
  created(res, { user });
});

export const registerShop = asyncHandler(async (req, res) => {
  const { user, shop, session } = await auth.registerShop(req.body);
  setAuthCookies(res, session);
  created(res, { user, shop });
});

export const registerPartsShop = asyncHandler(async (req, res) => {
  const { user, partsShop, session } = await auth.registerPartsShop(req.body);
  setAuthCookies(res, session);
  created(res, { user, partsShop });
});

export const login = asyncHandler(async (req, res) => {
  const { user, shop, partsShop, session } = await auth.login(req.body);
  setAuthCookies(res, session);
  ok(res, { user, shop, partsShop });
});

export const refresh = asyncHandler(async (req, res) => {
  const { user, session } = await auth.refreshSession(req.cookies?.refresh_token);
  setAuthCookies(res, session);
  ok(res, { user });
});

export const logout = asyncHandler(async (req, res) => {
  await auth.logout(req.cookies?.refresh_token);
  clearAuthCookies(res);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => ok(res, await auth.getMe(req.user)));
