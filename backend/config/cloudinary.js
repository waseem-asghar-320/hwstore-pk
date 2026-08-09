const cloudinary = require('cloudinary').v2;

// Cloud name and API key are not sensitive on their own (they are routinely exposed
// in client-side upload widgets), so they are safe to keep in source control.
// The API secret is NEVER hard-coded — it must come from the CLOUDINARY_API_SECRET
// environment variable (set it in backend/.env locally, and in the Vercel Project
// Settings -> Environment Variables for production).
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'rxtpqlsx';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '265676185824175';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

const isCloudinaryConfigured = Boolean(CLOUDINARY_API_SECRET);

if (!isCloudinaryConfigured) {
  console.warn(
    '⚠️  CLOUDINARY_API_SECRET is not set. Image uploads will fail until it is configured ' +
      '(backend/.env locally, or Project Settings -> Environment Variables on Vercel).'
  );
}

module.exports = cloudinary;
module.exports.isCloudinaryConfigured = isCloudinaryConfigured;
module.exports.CLOUDINARY_CLOUD_NAME = CLOUDINARY_CLOUD_NAME;
