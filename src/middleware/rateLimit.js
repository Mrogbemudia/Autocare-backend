import rateLimit from 'express-rate-limit';
import { HttpError } from '../utils/httpError.js';

const handler = (req, res, next) =>
  next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));

const make = (opts) => rateLimit({ standardHeaders: 'draft-7', legacyHeaders: false, handler, ...opts });

export const apiLimiter      = make({ windowMs: 15 * 60_000, limit: 600 });
// Counts only failed logins: 5 wrong passwords per 15 minutes per IP.
export const loginLimiter    = make({ windowMs: 15 * 60_000, limit: 5, skipSuccessfulRequests: true });
export const registerLimiter = make({ windowMs: 60 * 60_000, limit: 10 });
export const refreshLimiter  = make({ windowMs: 15 * 60_000, limit: 60 });
