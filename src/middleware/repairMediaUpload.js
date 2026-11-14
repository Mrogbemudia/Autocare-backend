import multer from 'multer';
import { badRequest } from '../utils/httpError.js';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const storage = {
  _handleFile(req, file, callback) {
    const maxBytes = file.fieldname === 'video' ? VIDEO_LIMIT : IMAGE_LIMIT;
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    file.stream.on('limit', () => {
      tooLarge = true;
      chunks.length = 0;
    });
    file.stream.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    file.stream.on('error', callback);
    file.stream.on('end', () => {
      if (tooLarge || file.stream.truncated) {
        callback(new multer.MulterError('LIMIT_FILE_SIZE', file.fieldname));
      } else {
        callback(null, { buffer: Buffer.concat(chunks), size });
      }
    });
  },
  _removeFile(req, file, callback) {
    delete file.buffer;
    callback(null);
  },
};

const parser = multer({
  storage,
  limits: { files: 6, fields: 8, parts: 14, fileSize: VIDEO_LIMIT },
  fileFilter(req, file, callback) {
    const supported = file.fieldname === 'images'
      ? imageTypes.has(file.mimetype)
      : file.fieldname === 'video' && videoTypes.has(file.mimetype);
    callback(supported ? null : badRequest('Use JPEG, PNG, or WebP images and MP4, WebM, or MOV videos.', 'UNSUPPORTED_MEDIA_TYPE'), supported);
  },
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 },
]);

export function receiveRepairMedia(req, res, next) {
  parser(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Images must be 10 MB or smaller and videos must be 50 MB or smaller.'
        : 'Attach up to 5 images and 1 video.';
      return next(badRequest(message, 'INVALID_MEDIA'));
    }
    next(error);
  });
}
