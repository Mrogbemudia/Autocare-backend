import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

if (env.cloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

function requireCloudinary() {
  if (!env.cloudinary) {
    throw new HttpError(503, 'MEDIA_STORAGE_NOT_CONFIGURED', 'Photo and video uploads are not configured on the server.');
  }
}

export async function uploadRepairMedia(file, { userId, folder }) {
  requireCloudinary();
  const resourceType = file.fieldname === 'video' ? 'video' : 'image';
  const publicId = randomUUID();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: resourceType,
      type: 'authenticated',
      folder: `kaza/${folder}/${userId}`,
      public_id: publicId,
      overwrite: false,
      unique_filename: false,
    }, (error, result) => {
      if (error) {
        const status = Number(error.http_code);
        console.error('Cloudinary upload failed:', {
          status: Number.isFinite(status) ? status : null,
          name: error.name,
          message: error.message,
        });
        if (status === 401 || status === 403) {
          reject(new HttpError(
            502,
            'MEDIA_STORAGE_AUTH_FAILED',
            'Cloudinary rejected the backend credentials. Check the Cloudinary environment variables on the backend service.',
          ));
          return;
        }
        if (status === 413) {
          reject(new HttpError(
            413,
            'MEDIA_TOO_LARGE',
            'Cloudinary rejected this file because it exceeds the account upload limit.',
          ));
          return;
        }
        if (status === 400) {
          reject(new HttpError(
            400,
            'MEDIA_REJECTED',
            'Cloudinary rejected this file. Check its format and the account upload settings.',
          ));
          return;
        }
        reject(new HttpError(502, 'MEDIA_UPLOAD_FAILED', 'Cloudinary could not save this file. Check the backend service logs and try again.'));
        return;
      }
      if (!result) {
        reject(new HttpError(502, 'MEDIA_UPLOAD_FAILED', 'Cloudinary returned no upload result. Check the backend service logs and try again.'));
        return;
      }
      resolve({
        publicId: result.public_id,
        resourceType: result.resource_type,
        format: result.format,
        version: result.version,
        bytes: result.bytes,
      });
    });
    stream.on('error', (error) => {
      console.error('Cloudinary upload stream failed:', error.message);
      reject(new HttpError(502, 'MEDIA_UPLOAD_FAILED', 'The media upload stream failed. Please try again.'));
    });
    stream.end(file.buffer);
  });
}

export function mediaDeliveryUrl(media) {
  requireCloudinary();
  return cloudinary.url(media.public_id, {
    resource_type: media.resource_type,
    type: 'authenticated',
    format: media.format,
    version: media.version,
    secure: true,
    sign_url: true,
  });
}

export async function deleteRepairMedia(media) {
  requireCloudinary();
  const result = await cloudinary.uploader.destroy(media.publicId, {
    resource_type: media.resourceType,
    type: 'authenticated',
    invalidate: true,
  });
  if (!['ok', 'not found'].includes(result.result)) {
    throw new Error(`Cloudinary did not delete ${media.publicId}: ${result.result}`);
  }
}
