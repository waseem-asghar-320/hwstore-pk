const cloudinary = require('../config/cloudinary');

const PRODUCT_IMAGE_FOLDER = 'watches-store/products';

/**
 * Uploads a single in-memory file buffer to Cloudinary via a stream (no disk I/O,
 * so this works on Vercel's read-only filesystem as well as locally).
 * Resolves with the raw Cloudinary upload result (includes secure_url, public_id, ...).
 */
function uploadBufferToCloudinary(buffer, folder = PRODUCT_IMAGE_FOLDER) {
  return new Promise((resolve, reject) => {
    if (!buffer) {
      reject(new Error('No file buffer provided for upload'));
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Uploads every file coming from Multer's memoryStorage (req.files) to Cloudinary
 * in parallel and returns the array of secure_url strings, ready to be stored on
 * the Product document's `images` field.
 */
async function uploadProductImages(files) {
  if (!files || files.length === 0) return [];
  if (!cloudinary.isCloudinaryConfigured) {
    const error = new Error(
      'Image upload is not configured: set the CLOUDINARY_API_SECRET environment variable.'
    );
    error.name = 'ConfigurationError';
    throw error;
  }
  const fileArray = Array.isArray(files) ? files : [files];
  const results = await Promise.all(
    fileArray.map((file) => uploadBufferToCloudinary(file.buffer))
  );
  return results.map((result) => result.secure_url);
}

/**
 * Returns true if the given value looks like a Cloudinary delivery URL.
 */
function isCloudinaryUrl(value) {
  return typeof value === 'string' && /^https?:\/\/res\.cloudinary\.com\//.test(value);
}

/**
 * Reconstructs a Cloudinary public_id from a secure_url produced by an upload
 * that used no eager transformations (our case). Example:
 *   https://res.cloudinary.com/demo/image/upload/v1699999999/watches-store/products/abc123.jpg
 *   -> watches-store/products/abc123
 */
function extractPublicId(url) {
  if (typeof url !== 'string') return null;
  const uploadMarker = '/upload/';
  const markerIndex = url.indexOf(uploadMarker);
  if (markerIndex === -1) return null;

  let rest = url.slice(markerIndex + uploadMarker.length);
  rest = rest.split(/[?#]/)[0]; // drop any query string / fragment
  rest = rest.replace(/^v\d+\//, ''); // drop the leading version segment, e.g. v1699999999/

  const lastDot = rest.lastIndexOf('.');
  const publicId = lastDot === -1 ? rest : rest.slice(0, lastDot);

  return publicId || null;
}

/**
 * Best-effort delete of a Cloudinary asset given its secure_url. Never throws —
 * a failed cleanup (e.g. asset already removed) should not block the surrounding
 * product create/update/delete request.
 */
async function deleteProductImage(imageUrl) {
  if (!isCloudinaryUrl(imageUrl)) {
    return { skipped: true, reason: 'not-a-cloudinary-url' };
  }

  const publicId = extractPublicId(imageUrl);
  if (!publicId) {
    return { skipped: true, reason: 'public-id-not-found' };
  }

  if (!cloudinary.isCloudinaryConfigured) {
    return { skipped: true, reason: 'cloudinary-not-configured' };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    return result;
  } catch (error) {
    console.error(`⚠️ Failed to delete Cloudinary image (${publicId}):`, error.message);
    return { error: error.message };
  }
}

module.exports = {
  PRODUCT_IMAGE_FOLDER,
  uploadBufferToCloudinary,
  uploadProductImages,
  isCloudinaryUrl,
  extractPublicId,
  deleteProductImage,
};
