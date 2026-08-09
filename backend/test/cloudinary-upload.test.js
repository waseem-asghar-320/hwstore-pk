const test = require('node:test');
const assert = require('node:assert/strict');

const cloudinary = require('../config/cloudinary');
const {
  extractPublicId,
  isCloudinaryUrl,
  uploadBufferToCloudinary,
  uploadProductImages,
  deleteProductImage,
} = require('../utils/cloudinaryUpload');

test('isCloudinaryUrl recognizes Cloudinary delivery URLs only', () => {
  assert.equal(
    isCloudinaryUrl('https://res.cloudinary.com/rxtpqlsx/image/upload/v123/watches-store/products/abc.jpg'),
    true
  );
  assert.equal(isCloudinaryUrl('http://res.cloudinary.com/demo/image/upload/v1/x.png'), true);
  assert.equal(isCloudinaryUrl('/uploads/1785433856417-96726811.jpg'), false);
  assert.equal(isCloudinaryUrl('https://example.com/image.jpg'), false);
  assert.equal(isCloudinaryUrl(''), false);
  assert.equal(isCloudinaryUrl(null), false);
  assert.equal(isCloudinaryUrl(undefined), false);
});

test('extractPublicId parses the public_id out of a standard secure_url', () => {
  const url =
    'https://res.cloudinary.com/rxtpqlsx/image/upload/v1699999999/watches-store/products/171234567-892355650.jpg';
  assert.equal(extractPublicId(url), 'watches-store/products/171234567-892355650');
});

test('extractPublicId handles URLs without a version segment', () => {
  const url = 'https://res.cloudinary.com/rxtpqlsx/image/upload/watches-store/products/abc123.png';
  assert.equal(extractPublicId(url), 'watches-store/products/abc123');
});

test('extractPublicId strips query strings and fragments', () => {
  const url =
    'https://res.cloudinary.com/rxtpqlsx/image/upload/v1/watches-store/products/abc.jpg?a=1&b=2#frag';
  assert.equal(extractPublicId(url), 'watches-store/products/abc');
});

test('extractPublicId returns null for non-Cloudinary or malformed input', () => {
  assert.equal(extractPublicId('https://example.com/no-upload-marker.jpg'), null);
  assert.equal(extractPublicId(null), null);
  assert.equal(extractPublicId(42), null);
  assert.equal(extractPublicId(''), null);
});

test('uploadBufferToCloudinary resolves with the SDK result on success (mocked, no network)', async () => {
  const originalUploadStream = cloudinary.uploader.upload_stream;
  const originalConfigured = cloudinary.isCloudinaryConfigured;
  cloudinary.isCloudinaryConfigured = true;

  let capturedOptions = null;
  let endedBuffer = null;
  cloudinary.uploader.upload_stream = (options, callback) => {
    capturedOptions = options;
    return {
      end(buffer) {
        endedBuffer = buffer;
        callback(null, {
          secure_url: 'https://res.cloudinary.com/rxtpqlsx/image/upload/v1/watches-store/products/fake123.jpg',
          public_id: 'watches-store/products/fake123',
        });
      },
    };
  };

  try {
    const fakeBuffer = Buffer.from('fake-image-bytes');
    const result = await uploadBufferToCloudinary(fakeBuffer);
    assert.equal(result.secure_url, 'https://res.cloudinary.com/rxtpqlsx/image/upload/v1/watches-store/products/fake123.jpg');
    assert.equal(capturedOptions.folder, 'watches-store/products');
    assert.equal(capturedOptions.resource_type, 'image');
    assert.equal(endedBuffer, fakeBuffer);
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
    cloudinary.isCloudinaryConfigured = originalConfigured;
  }
});

test('uploadBufferToCloudinary rejects when the SDK callback errors (mocked)', async () => {
  const originalUploadStream = cloudinary.uploader.upload_stream;
  cloudinary.uploader.upload_stream = (options, callback) => ({
    end() {
      callback(new Error('simulated Cloudinary failure'));
    },
  });

  try {
    await assert.rejects(
      () => uploadBufferToCloudinary(Buffer.from('x')),
      /simulated Cloudinary failure/
    );
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
  }
});

test('uploadProductImages returns [] for empty/no files without touching the network', async () => {
  assert.deepEqual(await uploadProductImages([]), []);
  assert.deepEqual(await uploadProductImages(undefined), []);
});

test('uploadProductImages throws a clear error when CLOUDINARY_API_SECRET is not configured', async () => {
  const originalConfigured = cloudinary.isCloudinaryConfigured;
  cloudinary.isCloudinaryConfigured = false;

  try {
    await assert.rejects(
      () => uploadProductImages([{ buffer: Buffer.from('x'), originalname: 'a.jpg' }]),
      /CLOUDINARY_API_SECRET/
    );
  } finally {
    cloudinary.isCloudinaryConfigured = originalConfigured;
  }
});

test('uploadProductImages uploads every file in parallel and returns secure_url strings (mocked)', async () => {
  const originalUploadStream = cloudinary.uploader.upload_stream;
  const originalConfigured = cloudinary.isCloudinaryConfigured;
  cloudinary.isCloudinaryConfigured = true;

  let callCount = 0;
  cloudinary.uploader.upload_stream = (options, callback) => ({
    end() {
      callCount += 1;
      const n = callCount;
      callback(null, {
        secure_url: `https://res.cloudinary.com/rxtpqlsx/image/upload/v1/watches-store/products/img${n}.jpg`,
        public_id: `watches-store/products/img${n}`,
      });
    },
  });

  try {
    const files = [
      { buffer: Buffer.from('one'), originalname: 'one.jpg' },
      { buffer: Buffer.from('two'), originalname: 'two.jpg' },
    ];
    const urls = await uploadProductImages(files);
    assert.equal(urls.length, 2);
    assert.ok(urls.every((u) => u.startsWith('https://res.cloudinary.com/rxtpqlsx/image/upload/')));
    assert.equal(callCount, 2);
  } finally {
    cloudinary.uploader.upload_stream = originalUploadStream;
    cloudinary.isCloudinaryConfigured = originalConfigured;
  }
});

test('deleteProductImage calls destroy with the extracted public_id (mocked)', async () => {
  const originalDestroy = cloudinary.uploader.destroy;
  const originalConfigured = cloudinary.isCloudinaryConfigured;
  cloudinary.isCloudinaryConfigured = true;

  let destroyedId = null;
  cloudinary.uploader.destroy = async (publicId) => {
    destroyedId = publicId;
    return { result: 'ok' };
  };

  try {
    const url = 'https://res.cloudinary.com/rxtpqlsx/image/upload/v1/watches-store/products/toDelete.jpg';
    const result = await deleteProductImage(url);
    assert.equal(destroyedId, 'watches-store/products/toDelete');
    assert.equal(result.result, 'ok');
  } finally {
    cloudinary.uploader.destroy = originalDestroy;
    cloudinary.isCloudinaryConfigured = originalConfigured;
  }
});

test('deleteProductImage never throws, even if the SDK call fails (best-effort cleanup)', async () => {
  const originalDestroy = cloudinary.uploader.destroy;
  const originalConfigured = cloudinary.isCloudinaryConfigured;
  cloudinary.isCloudinaryConfigured = true;
  cloudinary.uploader.destroy = async () => {
    throw new Error('simulated network error');
  };

  try {
    const url = 'https://res.cloudinary.com/rxtpqlsx/image/upload/v1/watches-store/products/x.jpg';
    const result = await deleteProductImage(url);
    assert.ok(result.error);
  } finally {
    cloudinary.uploader.destroy = originalDestroy;
    cloudinary.isCloudinaryConfigured = originalConfigured;
  }
});

test('deleteProductImage skips non-Cloudinary values without calling the SDK', async () => {
  const originalDestroy = cloudinary.uploader.destroy;
  let called = false;
  cloudinary.uploader.destroy = async () => {
    called = true;
  };

  try {
    const result = await deleteProductImage('/uploads/legacy-local-file.jpg');
    assert.equal(called, false);
    assert.equal(result.skipped, true);
  } finally {
    cloudinary.uploader.destroy = originalDestroy;
  }
});
