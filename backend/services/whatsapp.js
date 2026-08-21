const GRAPH_API_VERSION =
  process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';

async function sendNewOrderNotification(order) {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const recipientNumber = process.env.WHATSAPP_RECIPIENT_NUMBER;

    if (!accessToken || !phoneNumberId || !recipientNumber) {
      throw new Error('WhatsApp environment variables are missing');
    }

    const orderId = String(order._id).slice(-8).toUpperCase();
    const orderItems = Array.isArray(order.items) && order.items.length
      ? order.items
      : [{
        name: order.productName || 'N/A',
        quantity: order.quantity || 1,
      }];
    const productSummary = orderItems
      .map((item) => `${String(item.name || 'N/A').trim()} - Quantity: ${item.quantity || 1}`)
      .join(' | ');
    const totalQuantity = orderItems
      .reduce((total, item) => total + Number(item.quantity || 1), 0);

    const message = {
      messaging_product: 'whatsapp',
      to: recipientNumber,
      type: 'template',
      template: {
        name: process.env.WHATSAPP_ORDER_TEMPLATE || 'new_order_alert',
        language: {
          code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
        },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: orderId,
              },
              {
                type: 'text',
                text: order.customerName || 'N/A',
              },
              {
                type: 'text',
                text: order.customerPhone || 'N/A',
              },
              {
                type: 'text',
                text: productSummary,
              },
              {
                type: 'text',
                text: String(totalQuantity),
              },
              {
                type: 'text',
                text: `Rs. ${Number(
                  order.totalPrice || 0
                ).toLocaleString('en-PK')}`,
              },
              {
                type: 'text',
                text: order.customerAddress || 'N/A',
              },
              {
                type: 'text',
                text: order.color || 'Not specified',
              },
              {
                type: 'text',
                text: order.notes || 'None',
              },
            ],
          },
        ],
      },
    };

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API error:', result);
      throw new Error(
        result?.error?.message ||
        'WhatsApp notification failed'
      );
    }

    console.log('✅ WhatsApp notification sent');

    return result;
  } catch (error) {
    console.error(
      '❌ WhatsApp notification error:',
      error.message
    );

    throw error;
  }
}

module.exports = {
  sendNewOrderNotification,
};