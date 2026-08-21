const Order = require('../models/Order');
const Product = require('../models/Product');
const {
  sendNewOrderNotification,
} = require('../services/whatsapp');

const {
  sendNewOrderEmail,
} = require('../services/email');

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ orderDate: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const payload = req.body || {};
    const items = Array.isArray(payload.items) ? payload.items : [];

    const normalizeCustomer = (customer = {}) => ({
      name: String(customer.name || payload.customerName || '').trim(),
      phone: String(customer.phone || payload.customerPhone || '').trim(),
      address: String(customer.address || payload.customerAddress || '').trim(),
      city: String(customer.city || '').trim(),
    });

    const normalizeLegacyOrder = async () => {
      const { productId, customerName, customerPhone, customerAddress, quantity, notes, color } = payload;

      if (!productId) {
        throw new Error('Product ID is required');
      }

      const product = await Product.findById(productId);
      if (!product) {
        throw Object.assign(new Error('Product not found'), { statusCode: 404 });
      }

      const orderQuantity = Number(quantity || 1);
      if (orderQuantity > product.stock) {
        const err = new Error(`Insufficient stock. Only ${product.stock} item(s) available`);
        err.statusCode = 400;
        throw err;
      }

      const unitPrice = product.discountPrice && product.discountPrice < product.price
        ? product.discountPrice
        : product.price;
      const totalPrice = unitPrice * orderQuantity;

      const order = await Order.create({
        productId: product._id,
        productName: product.name,
        customerName: String(customerName || '').trim(),
        customerPhone: String(customerPhone || '').trim(),
        customerAddress: String(customerAddress || '').trim(),
        quantity: orderQuantity,
        color: color ? String(color).trim() : '',
        totalPrice,
        notes: notes || '',
        customer: {
          name: String(customerName || '').trim(),
          phone: String(customerPhone || '').trim(),
          address: String(customerAddress || '').trim(),
          city: '',
        },
        items: [{
          productId: product._id,
          name: product.name,
          price: unitPrice,
          quantity: orderQuantity,
          image: Array.isArray(product.images) ? product.images[0] || '' : '',
          selectedColor: color ? String(color).trim() : '',
          selectedSize: '',
        }],
        totalAmount: totalPrice,
        paymentMethod: payload.paymentMethod || 'COD',
        status: payload.status || 'Pending',
        orderStatus: payload.status || 'Pending',
      });

      product.stock -= orderQuantity;
      await product.save();

      return order;
    };

    const normalizeMultiOrder = async () => {
      if (!items.length) {
        return normalizeLegacyOrder();
      }

      const customer = normalizeCustomer(payload.customer || {});
      if (!customer.name || !customer.phone || !customer.address) {
        const err = new Error('Customer name, phone and address are required');
        err.statusCode = 400;
        throw err;
      }

      const normalizedItems = [];
      const outOfStockItems = [];
      let totalAmount = 0;

      for (const item of items) {
        const itemId = item.productId || item._id || item.id;
        if (!itemId) {
          const err = new Error('Each cart item must include a productId');
          err.statusCode = 400;
          throw err;
        }

        const product = await Product.findById(itemId);
        if (!product) {
          const err = new Error(`Product not found for item: ${itemId}`);
          err.statusCode = 404;
          throw err;
        }

        const qty = Math.max(1, Number(item.quantity || 1));
        if (qty > product.stock) {
          outOfStockItems.push({ productId: String(product._id), name: product.name || 'Unknown Product' });
          continue;
        }

        const unitPrice = product.discountPrice && product.discountPrice < product.price
          ? product.discountPrice
          : product.price;

        const safeItem = {
          productId: product._id,
          name: String(item.name || product.name).trim(),
          price: Number(item.price || unitPrice),
          quantity: qty,
          image: String(item.image || (Array.isArray(product.images) ? product.images[0] || '' : '')).trim(),
          selectedColor: item.selectedColor ? String(item.selectedColor).trim() : '',
          selectedSize: item.selectedSize ? String(item.selectedSize).trim() : '',
        };

        normalizedItems.push(safeItem);
        totalAmount += safeItem.price * safeItem.quantity;
      }

      if (outOfStockItems.length > 0 || normalizedItems.length === 0) {
        const err = new Error('Some products are out of stock.');
        err.statusCode = 400;
        err.outOfStockItems = outOfStockItems;
        throw err;
      }

      const orderPayload = {
        customer,
        items: normalizedItems,
        totalAmount: Number(payload.totalAmount || totalAmount),
        paymentMethod: payload.paymentMethod || 'COD',
        status: payload.status || 'Pending',
        orderStatus: payload.status || 'Pending',
        productId: normalizedItems[0]?.productId || null,
        productName: normalizedItems[0]?.name || '',
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        quantity: normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
        color: normalizedItems[0]?.selectedColor || '',
        totalPrice: Number(payload.totalAmount || totalAmount),
        notes: payload.notes || '',
      };

      const order = await Order.create(orderPayload);

      for (const item of normalizedItems) {
        const product = await Product.findById(item.productId);
        if (!product) continue;
        product.stock -= item.quantity;
        await product.save();
      }

      return order;
    };

    const order = await (items.length ? normalizeMultiOrder() : normalizeLegacyOrder());

    try {
      await sendNewOrderEmail(order);
    } catch (emailError) {
      console.error('⚠️ Order saved but email notification failed:', emailError.message);
    }

    try {
      await sendNewOrderNotification(order);
    } catch (whatsappError) {
      console.error('⚠️ Order saved but WhatsApp notification failed:', whatsappError.message);
    }

    res.status(201).json({ success: true, message: 'Order placed successfully', data: order });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }
    if (error.statusCode) {
      const payload = { success: false, message: error.message };
      if (Array.isArray(error.outOfStockItems) && error.outOfStockItems.length) {
        payload.outOfStockItems = error.outOfStockItems;
      }
      return res.status(error.statusCode).json(payload);
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Delivered', 'Cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.orderStatus = status;
    await order.save();

    res.status(200).json({ success: true, message: 'Order status updated', data: order });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.status(200).json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
