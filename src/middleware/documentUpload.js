import multer from 'multer';
import { badRequest } from '../utils/httpError.js';

const storage = multer.memoryStorage();
const parser = multer({
  storage,
  limits: { files: 5, fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    callback(allowed.has(file.mimetype) ? null : badRequest('Upload JPEG, PNG, WebP, or PDF documents.', 'UNSUPPORTED_DOCUMENT'), allowed.has(file.mimetype));
  },
}).array('documents', 5);

export function receiveDocuments(req, res, next) {
  parser(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return next(badRequest('Attach up to 5 documents, each no larger than 10 MB.', 'INVALID_DOCUMENT'));
    }
    next(error);
  });
}
