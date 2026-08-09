const multer = require('multer');
const path = require('path');

// Files are kept in memory (as Buffers) and streamed straight to Cloudinary —
// nothing is written to disk, so this works on Vercel's read-only filesystem
// (previously this used multer.diskStorage(), which caused:
//   EROFS: read-only file system, open '/var/task/backend/uploads/...'
// on Vercel because the deployment bundle is read-only).
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|bmp/i;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
