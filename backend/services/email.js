const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendNewOrderEmail(order) {
  const customerPhone = String(order.customerPhone || '').replace(/\D/g, '');

  let whatsappNumber = customerPhone;

  // Convert Pakistani number 03XXXXXXXXX → 923XXXXXXXXX
  if (whatsappNumber.startsWith('0')) {
    whatsappNumber = '92' + whatsappNumber.substring(1);
  }

  const whatsappLink = `https://wa.me/${whatsappNumber}`;

  const qrCodeDataUrl = await QRCode.toDataURL(whatsappLink);
  const orderId = String(order._id).slice(-8).toUpperCase();
  const orderItems = Array.isArray(order.items) && order.items.length
    ? order.items
    : [{
      name: order.productName || 'N/A',
      quantity: order.quantity || 1,
      selectedColor: order.color || '',
    }];
  const productDetails = orderItems.map((item) => `
    <li>
      <strong>${item.name || 'N/A'}</strong>
      <span>Quantity: ${item.quantity || 1}</span>
      ${item.selectedColor ? `<span>Color: ${item.selectedColor}</span>` : ''}
    </li>
  `).join('');

  const mailOptions = {
    from: `"RW Store" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL,

    subject: `🔔 New Order #${orderId} - RW Store`,

    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">

        <h2>🔔 New Order Received</h2>

        <hr>

        <h3>Order Details</h3>

        <p><strong>Order ID:</strong> #${orderId}</p>

        <h3>Customer Details</h3>

        <p><strong>Name:</strong> ${order.customerName || 'N/A'}</p>
        <p><strong>Phone:</strong> ${order.customerPhone || 'N/A'}</p>
        <h3>Contact Customer on WhatsApp</h3>

<p>Scan this QR code to open the customer's WhatsApp chat:</p>

<img
  src="${qrCodeDataUrl}"
  alt="Customer WhatsApp QR Code"
  width="200"
  height="200"
/>

<p>
  <a href="${whatsappLink}">
    Open WhatsApp
  </a>
</p>
        <p><strong>Address:</strong> ${order.customerAddress || 'N/A'}</p>

        <h3>Product Details</h3>

        <ul>
          ${productDetails}
        </ul>

        <h3>Payment</h3>

        <p>
          <strong>Total:</strong>
          Rs. ${Number(order.totalPrice || 0).toLocaleString('en-PK')}
        </p>

        <h3>Notes</h3>

        <p>${order.notes || 'None'}</p>

        <hr>

        <p>
          <strong>RW Store</strong><br>
          New order notification
        </p>

      </div>
    `,
  };

  const result = await transporter.sendMail(mailOptions);

  console.log('✅ New order email sent:', result.messageId);

  return result;
}

module.exports = {
  sendNewOrderEmail,
};