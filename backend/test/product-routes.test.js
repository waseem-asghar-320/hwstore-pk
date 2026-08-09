const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');

const { createApp } = require('../app');
const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');

// ---- Mock Cloudinary (no real network calls) --------------------------------
let uploadCallCount = 0;
const destroyedPublicIds = [];

const originalUploadStream = cloudinary.uploader.upload_stream;
const originalDestroy = cloudinary.uploader.destroy;
const originalConfigured = cloudinary.isCloudinaryConfigured;

function installCloudinaryMock() {
  cloudinary.isCloudinaryConfigured = true;
  uploadCallCount = 0;
  destroyedPublicIds.length = 0;

  cloudinary.uploader.upload_stream = (options, callback) => ({
    end() {
      uploadCallCount += 1;
      const n = uploadCallCount;
      callback(null, {
        secure_url: `https://res.cloudinary.com/rxtpqlsx/image/upload/v1700000000/${options.folder}/mock${n}.jpg`,
        public_id: `${options.folder}/mock${n}`,
      });
    },
  });

  cloudinary.uploader.destroy = async (publicId) => {
    destroyedPublicIds.push(publicId);
    return { result: 'ok' };
  };
}

function restoreCloudinaryMock() {
  cloudinary.uploader.upload_stream = originalUploadStream;
  cloudinary.uploader.destroy = originalDestroy;
  cloudinary.isCloudinaryConfigured = originalConfigured;
}

// ---- Mock the Product model (no real MongoDB) --------------------------------
const originalCreate = Product.create;
const originalFindById = Product.findById;
const originalFindByIdAndDelete = Product.findByIdAndDelete;

function installProductMock() {
  const store = new Map();
  let idCounter = 1;

  function attachSave(doc) {
    doc.save = async function () {
      store.set(String(doc._id), { ...doc });
      return doc;
    };
    return doc;
  }

  Product.create = async (data) => {
    if (!data.name || !data.brand || !data.category || !data.description) {
      const error = new Error('ValidationError');
      error.name = 'ValidationError';
      error.errors = { name: { message: 'Product name is required' } };
      throw error;
    }
    const _id = String(idCounter++);
    const doc = attachSave({ _id, createdAt: new Date().toISOString(), ...data });
    store.set(_id, { ...doc });
    return doc;
  };

  Product.findById = async (id) => {
    const existing = store.get(String(id));
    if (!existing) return null;
    return attachSave({ ...existing });
  };

  Product.findByIdAndDelete = async (id) => {
    const existing = store.get(String(id));
    store.delete(String(id));
    return existing || null;
  };

  return store;
}

function restoreProductMock() {
  Product.create = originalCreate;
  Product.findById = originalFindById;
  Product.findByIdAndDelete = originalFindByIdAndDelete;
}

async function startServer() {
  const app = createApp();
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function makeImageBlob(text = 'fake-image-bytes') {
  return new Blob([text], { type: 'image/jpeg' });
}

test('product routes: create, update, delete all flow through Cloudinary (mocked)', async (t) => {
  installCloudinaryMock();
  installProductMock();
  const { server, baseUrl } = await startServer();

  t.after(async () => {
    server.close();
    restoreCloudinaryMock();
    restoreProductMock();
  });

  let createdId;

  await t.test('POST /api/products uploads images to Cloudinary and stores secure_url strings', async () => {
    const formData = new FormData();
    formData.append('name', 'Test Chrono');
    formData.append('brand', 'TestBrand');
    formData.append('category', 'Automatic');
    formData.append('price', '199');
    formData.append('discountPrice', '0');
    formData.append('stock', '5');
    formData.append('description', 'A watch used for testing');
    formData.append('images', makeImageBlob('img-1'), 'one.jpg');
    formData.append('images', makeImageBlob('img-2'), 'two.jpg');

    const response = await fetch(`${baseUrl}/api/products`, { method: 'POST', body: formData });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.images.length, 2);
    for (const url of body.data.images) {
      assert.match(url, /^https:\/\/res\.cloudinary\.com\/rxtpqlsx\/image\/upload\//);
    }
    assert.equal(uploadCallCount, 2);

    createdId = body.data._id;
  });

  await t.test('POST /api/products with no files returns 400 (no Cloudinary call made)', async () => {
    const before = uploadCallCount;
    const formData = new FormData();
    formData.append('name', 'No Image Watch');
    formData.append('brand', 'TestBrand');
    formData.append('category', 'Automatic');
    formData.append('price', '50');
    formData.append('stock', '1');
    formData.append('description', 'Should fail validation');

    const response = await fetch(`${baseUrl}/api/products`, { method: 'POST', body: formData });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /at least one product image/i);
    assert.equal(uploadCallCount, before);
  });

  await t.test('PUT /api/products/:id removes a dropped image from Cloudinary and adds the new one', async () => {
    const getResponse = await fetch(`${baseUrl}/api/products/${createdId}`);
    const getBody = await getResponse.json();
    const [keepImage, dropImage] = getBody.data.images;

    const formData = new FormData();
    formData.append('name', 'Test Chrono Updated');
    formData.append('brand', 'TestBrand');
    formData.append('category', 'Automatic');
    formData.append('price', '210');
    formData.append('discountPrice', '0');
    formData.append('stock', '4');
    formData.append('description', 'Updated description');
    formData.append('existingImages', JSON.stringify([keepImage]));
    formData.append('images', makeImageBlob('img-3'), 'three.jpg');

    const response = await fetch(`${baseUrl}/api/products/${createdId}`, { method: 'PUT', body: formData });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.images.length, 2);
    assert.ok(body.data.images.includes(keepImage), 'kept image should still be present');
    assert.ok(!body.data.images.includes(dropImage), 'dropped image should be removed');

    const expectedDeletedId = dropImage.split('/upload/v1700000000/')[1].replace(/\.jpg$/, '');
    assert.ok(destroyedPublicIds.includes(expectedDeletedId), 'Cloudinary destroy should have been called for the dropped image');
  });

  await t.test('DELETE /api/products/:id removes all remaining images from Cloudinary', async () => {
    destroyedPublicIds.length = 0;
    const response = await fetch(`${baseUrl}/api/products/${createdId}`, { method: 'DELETE' });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(destroyedPublicIds.length, 2, 'both remaining images should be deleted from Cloudinary');

    const getResponse = await fetch(`${baseUrl}/api/products/${createdId}`);
    assert.equal(getResponse.status, 404);
  });
});

test('product routes: POST returns a clear 500 when CLOUDINARY_API_SECRET is missing', async (t) => {
  installCloudinaryMock();
  installProductMock();
  cloudinary.isCloudinaryConfigured = false; // simulate missing env var
  const { server, baseUrl } = await startServer();

  t.after(async () => {
    server.close();
    restoreCloudinaryMock();
    restoreProductMock();
  });

  const formData = new FormData();
  formData.append('name', 'Unconfigured Watch');
  formData.append('brand', 'TestBrand');
  formData.append('category', 'Automatic');
  formData.append('price', '99');
  formData.append('stock', '1');
  formData.append('description', 'Should fail because Cloudinary is not configured');
  formData.append('images', makeImageBlob(), 'one.jpg');

  const response = await fetch(`${baseUrl}/api/products`, { method: 'POST', body: formData });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.message, /CLOUDINARY_API_SECRET/);
  assert.equal(uploadCallCount, 0, 'no upload should have been attempted');
});
