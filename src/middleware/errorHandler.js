import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';
import { env } from '../config/env.js';

export const notFoundHandler = (req, res, next) =>
  next(new HttpError(404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details;

  if (err instanceof HttpError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Some fields are invalid';
    details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large';
  } else if (err.code === '22P02') {            // invalid input syntax (e.g. bad uuid)
    status = 400; code = 'INVALID_INPUT'; message = 'Invalid input';
  } else if (err.code === '23505') {            // unique violation
    status = 409; code = 'ALREADY_EXISTS'; message = 'That record already exists';
  } else if (err.code === '23503') {            // foreign key violation
    status = 409; code = 'REFERENCED_RECORD'; message = 'This record is linked to other data';
  } else if (err.code === '23514') {            // check violation (also the Approval Lock trigger)
    status = 409; code = 'RULE_VIOLATION'; message = 'That change is not allowed right now';
  }

  if (status >= 500) console.error(err);
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  if (status >= 500 && !env.isProd) body.error.debug = err.message; // never stack traces, never in production
  res.status(status).json(body);
}
