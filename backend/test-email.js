require('dotenv').config();

const { sendNewOrderEmail } = require('./services/email');

const testOrder = {
  _id: 'TEST12345678',
  customerName: 'Test Customer',
  customerPhone: '03001234567',
  customerAddress: 'Lahore, Pakistan',
  productName: 'Test Product',
  quantity: 1,
  color: 'Black',
  totalPrice: 5000,
  notes: 'Test email notification',
};

sendNewOrderEmail(testOrder)
  .then(() => {
    console.log('✅ Test email completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test email failed:', error);
    process.exit(1);
  });