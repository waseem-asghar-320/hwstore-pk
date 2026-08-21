const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');

const { createApp } = require('../app');
const Product = require('../models/Product');
const Order = require('../models/Order');

const originalCreate = Order.create;
const originalFindById = Product.findById;

function installOrderMocks() {
  const products = new Map();
  let orderCounter = 1;

  Product.findById = async (id) => {
    const product = products.get(String(id));
    if (!product) return null;
    return {
      ...product,
      save: async () => {
        products.set(String(product._id), { ...product });
      },
    };
  };

  Order.create = async (data) => {
    const doc = {
      _id: `order-${orderCounter++}`,
      orderDate: new Date().toISOString(),
      orderStatus: 'Pending',
      ...data,
    };
    return doc;
  };

  products.set('p1', {
    _id: 'p1',
    name: 'Alpha Watch',
    price: 2000,
    discountPrice: 1500,
    stock: 10,
  });
  products.set('p2', {
    _id: 'p2',
    name: 'Beta Watch',
    price: 1500,
    discountPrice: 0,
    stock: 5,
  });
}

function restoreOrderMocks() {
  Order.create = originalCreate;
  Product.findById = originalFindById;
}

async function startServer() {
  const app = createApp();
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('multi-product COD orders are accepted and totals are preserved', async (t) => {
  installOrderMocks();
  const { server, baseUrl } = await startServer();

  t.after(async () => {
    server.close();
    restoreOrderMocks();
  });

  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'Ali Khan',
        phone: '03001234567',
        address: 'Lahore',
        city: 'Lahore',
      },
      items: [
        { productId: 'p1', name: 'Alpha Watch', price: 1500, quantity: 2, image: 'a.jpg' },
        { productId: 'p2', name: 'Beta Watch', price: 1500, quantity: 1, image: 'b.jpg' },
      ],
      totalAmount: 4500,
      paymentMethod: 'COD',
      status: 'Pending',
    }),
  });

  const body = await response.json();
  assert.equal(response.status, 201, body.message || 'Expected 201');
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data.items));
  assert.equal(body.data.items.length, 2);
  assert.equal(body.data.totalAmount, 4500);
  assert.equal(body.data.paymentMethod, 'COD');
  assert.equal(body.data.status, 'Pending');
});
