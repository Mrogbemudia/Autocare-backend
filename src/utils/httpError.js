export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const httpError = (status, message, code = 'HTTP_ERROR', details) =>
  new HttpError(status, code, message, details);
export const badRequest   = (message, code = 'BAD_REQUEST', details) => new HttpError(400, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') => new HttpError(401, code, message);
export const forbidden    = (message = 'You do not have permission to do that', code = 'FORBIDDEN') => new HttpError(403, code, message);
export const notFound     = (message = 'Not found', code = 'NOT_FOUND') => new HttpError(404, code, message);
export const conflict     = (code, message) => new HttpError(409, code, message);
