import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { ENV } from '../config/env.js';

if (ENV.CLOUDINARY_ENABLED) {
  cloudinary.config({
    cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
    api_key: ENV.CLOUDINARY_API_KEY,
    api_secret: ENV.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const COVER_FOLDER = ENV.CLOUDINARY_FOLDER;

export const isCloudinaryConfigured = (): boolean => ENV.CLOUDINARY_ENABLED;

/** Streams an in-memory buffer to Cloudinary. Cloudinary assigns the public id. */
export const uploadImage = (buffer: Buffer): Promise<{ url: string; publicId: string }> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: COVER_FOLDER,
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'webp'],
        // Cap stored size; covers never need more than this
        transformation: [{ width: 2400, height: 2400, crop: 'limit' }],
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) return reject(error || new Error('Empty Cloudinary response'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });

export const deleteImage = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
};
