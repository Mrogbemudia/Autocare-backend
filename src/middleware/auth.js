import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError, unauthorized, forbidden } from '../utils/httpError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { findUserById } from '../queries/users.queries.js';

async function loadUser(token) {
  const payload = verifyAccessToken(token);
  const user = await findUserById(payload.sub);
  return user?.is_active ? user : null;
}

export const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.access_token;
  if (!token) throw unauthorized();
  let user;
  try {
    user = await loadUser(token);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    throw new HttpError(401, expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      expired ? 'Session expired' : 'Invalid session');
  }
  if (!user) throw unauthorized('Account not available', 'INVALID_TOKEN');
  req.user = user; // role comes from the database, not from the token
  next();
});

// For public routes that show a bit more to logged-in users. A bad token is treated as a guest.
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.access_token;
  if (token) {
    try { req.user = (await loadUser(token)) ?? undefined; } catch { /* guest */ }
  }
  next();
});

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden());
