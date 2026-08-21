const RW_CART_STORAGE_KEY = 'rw_cart';

function getCart() {
  try {
    const storedCart = JSON.parse(localStorage.getItem(RW_CART_STORAGE_KEY) || '[]');
    return Array.isArray(storedCart) ? storedCart.map((item) => ({
      cartKey: item.cartKey || getCartItemKey(item.productId || item._id || item.id, item.selectedColor, item.selectedSize),
      productId: item.productId || item._id || item.id || '',
      name: item.name || 'Product',
      price: Number(item.price || item.salePrice || item.originalPrice || 0),
      originalPrice: Number(item.originalPrice || item.price || 0),
      image: item.image || '',
      quantity: Math.max(1, Number(item.quantity || 1)),
      selectedColor: item.selectedColor || '',
      selectedSize: item.selectedSize || '',
    })) : [];
  } catch (error) {
    return [];
  }
}

function saveCart(cart) {
  const nextCart = Array.isArray(cart) ? cart.map((item) => ({
    cartKey: item.cartKey || getCartItemKey(item.productId || item._id || item.id, item.selectedColor, item.selectedSize),
    productId: item.productId || item._id || item.id || '',
    name: item.name || 'Product',
    price: Number(item.price || 0),
    originalPrice: Number(item.originalPrice || item.price || 0),
    image: item.image || '',
    quantity: Math.max(1, Number(item.quantity || 1)),
    selectedColor: item.selectedColor || '',
    selectedSize: item.selectedSize || '',
  })) : [];

  localStorage.setItem(RW_CART_STORAGE_KEY, JSON.stringify(nextCart));
  updateCartUI();
  return nextCart;
}

function getCartItemKey(productId, selectedColor = '', selectedSize = '') {
  const normalizedProductId = String(productId || '').trim();
  const normalizedColor = String(selectedColor || '').trim();
  const normalizedSize = String(selectedSize || '').trim();
  return `${normalizedProductId}|${normalizedColor}|${normalizedSize}`;
}

function getProductUnitPrice(product) {
  const price = Number(product?.discountPrice ?? product?.salePrice ?? product?.price ?? 0);
  const originalPrice = Number(product?.price ?? product?.originalPrice ?? 0);

  if (product?.discountPrice && Number(product.discountPrice) < Number(product.price || Infinity)) {
    return Number(product.discountPrice);
  }

  if (price > 0) {
    return price;
  }

  return originalPrice;
}

function addToCart(product, quantity = 1, variant = {}) {
  if (!product) return [];

  if (Number(product.stock || 0) <= 0) {
    if (typeof showToast === 'function') {
      showToast('This product is out of stock.', 'error');
    }
    return getCart();
  }

  const cart = getCart();
  const productId = product._id || product.id || product.productId;
  if (!productId) {
    if (typeof showToast === 'function') {
      showToast('This product cannot be added because it has no ID.', 'error');
    }
    return cart;
  }
  const selectedColor = variant.selectedColor || variant.color || '';
  const selectedSize = variant.selectedSize || variant.size || '';
  const nextItem = {
    cartKey: getCartItemKey(productId, selectedColor, selectedSize),
    productId,
    name: product.name || 'Product',
    price: getProductUnitPrice(product),
    originalPrice: Number(product.price || product.originalPrice || 0),
    image: Array.isArray(product.images) ? product.images[0] || '' : (product.image || ''),
    quantity: Math.max(1, Number(quantity || 1)),
    selectedColor,
    selectedSize,
  };

  const existingIndex = cart.findIndex((item) => item.cartKey === nextItem.cartKey);
  if (existingIndex >= 0) {
    cart[existingIndex].quantity += nextItem.quantity;
    cart[existingIndex].price = Number(cart[existingIndex].price || nextItem.price || 0);
  } else {
    cart.push(nextItem);
  }

  saveCart(cart);

  if (typeof showToast === 'function') {
    showToast('Added to Cart', 'success');
  }

  if (window.fbq) {
    fbq('track', 'AddToCart', {
      content_ids: [String(productId)],
      content_type: 'product',
      value: Number(nextItem.price),
      currency: 'PKR',
    });
  }

  return cart;
}

function removeFromCart(cartKey) {
  const cart = getCart().filter((item) => item.cartKey !== cartKey);
  saveCart(cart);
  return cart;
}

function increaseQuantity(cartKey) {
  const cart = getCart();
  const index = cart.findIndex((item) => item.cartKey === cartKey);
  if (index >= 0) {
    cart[index].quantity = (Number(cart[index].quantity) || 1) + 1;
    saveCart(cart);
  }
  return cart;
}

function decreaseQuantity(cartKey) {
  const cart = getCart();
  const index = cart.findIndex((item) => item.cartKey === cartKey);
  if (index >= 0) {
    cart[index].quantity = Math.max(1, (Number(cart[index].quantity) || 1) - 1);
    saveCart(cart);
  }
  return cart;
}

function clearCart() {
  saveCart([]);
  return [];
}

function getCartCount() {
  return getCart().reduce((total, item) => total + Number(item.quantity || 0), 0);
}

function getCartTotal() {
  return getCart().reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
}

function ensureCartMarkup() {
  if (document.getElementById('cartDrawer')) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="cartDrawer" class="cart-drawer" aria-hidden="true">
      <div class="cart-drawer-overlay" data-cart-close="true"></div>
      <aside class="cart-drawer-panel" aria-label="Shopping cart">
        <div class="cart-drawer-header">
          <div>
            <span class="section-label">Your Basket</span>
            <h2>My Cart</h2>
          </div>
          <button type="button" class="cart-close-btn" id="cartDrawerClose" aria-label="Close cart">&times;</button>
        </div>

        <div id="cartItemsContainer" class="cart-items-container"></div>

        <div class="cart-summary">
          <div class="cart-summary-row cart-total-row">
            <span>Total</span>
            <strong id="cartTotalPrice">Rs. 0</strong>
          </div>
          <button type="button" id="checkoutWhatsAppBtn" class="btn btn-primary cart-action-btn">
            Place Order on WhatsApp
          </button>
          <button type="button" id="checkoutCodBtn" class="btn btn-secondary cart-action-btn">
            Place COD Order
          </button>
        </div>
      </aside>
    </div>

    <div id="cartCheckoutModal" class="cart-modal modal">
      <div class="modal-content cart-checkout-modal-content">
        <button type="button" class="modal-close cart-modal-close" aria-label="Close modal">&times;</button>
        <div class="modal-icon">📦</div>
        <h2>Complete Your COD Order</h2>
        <p class="modal-subtitle">Enter your delivery details to place the order.</p>
        <form id="cartCheckoutForm">
          <div class="form-group">
            <label for="cartCustomerName">Full Name *</label>
            <input type="text" id="cartCustomerName" name="cartCustomerName" placeholder="Your name" required />
          </div>
          <div class="form-group">
            <label for="cartCustomerPhone">Phone Number *</label>
            <input type="tel" id="cartCustomerPhone" name="cartCustomerPhone" placeholder="03XXXXXXXXX" required />
          </div>
          <div class="form-group">
            <label for="cartCustomerCity">City *</label>
            <input type="text" id="cartCustomerCity" name="cartCustomerCity" placeholder="City" required />
          </div>
          <div class="form-group">
            <label for="cartCustomerAddress">Delivery Address *</label>
            <textarea id="cartCustomerAddress" name="cartCustomerAddress" rows="3" placeholder="Street, City, Postal Code" required></textarea>
          </div>
          <div class="form-group">
            <label for="cartRiderNote">Note for rider</label>
            <input type="text" id="cartRiderNote" name="cartRiderNote" placeholder="Any delivery instructions?" />
          </div>
          <button type="submit" class="btn btn-primary btn-full">Confirm COD Order</button>
        </form>
      </div>
    </div>

    <div id="cartSuccessModal" class="cart-modal modal">
      <div class="modal-content cart-success-modal-content">
        <button type="button" class="modal-close cart-success-close" aria-label="Close modal">&times;</button>
        <div class="modal-icon">✅</div>
        <h2>Order Confirmed</h2>
        <p class="modal-subtitle">Your cart order has been placed successfully.</p>
        <div id="cartSuccessDetails"></div>
        <button type="button" class="btn btn-primary btn-full" id="cartContinueShoppingBtn">Continue Shopping</button>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  const drawer = document.getElementById('cartDrawer');
  const cartCloseBtn = document.getElementById('cartDrawerClose');
  const overlay = document.querySelector('[data-cart-close="true"]');
  const modalCloseButtons = document.querySelectorAll('.cart-modal-close, .cart-success-close');

  if (cartCloseBtn) {
    cartCloseBtn.addEventListener('click', closeCartDrawer);
  }

  if (overlay) {
    overlay.addEventListener('click', closeCartDrawer);
  }

  modalCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const modal = button.closest('.cart-modal');
      if (modal) {
        modal.classList.remove('open');
      }
    });
  });

  const cartForm = document.getElementById('cartCheckoutForm');
  if (cartForm) {
    cartForm.addEventListener('submit', handleCartCheckoutSubmit);
  }

  const cartContinueShoppingBtn = document.getElementById('cartContinueShoppingBtn');
  if (cartContinueShoppingBtn) {
    cartContinueShoppingBtn.addEventListener('click', () => {
      const modal = document.getElementById('cartSuccessModal');
      if (modal) modal.classList.remove('open');
      closeCartDrawer();
      window.location.href = 'index.html';
    });
  }

  const checkoutCodBtn = document.getElementById('checkoutCodBtn');
  if (checkoutCodBtn) {
    checkoutCodBtn.addEventListener('click', () => {
      if (getCart().length === 0) {
        if (typeof showToast === 'function') showToast('Your cart is empty.', 'error');
        return;
      }

      if (window.fbq) {
        fbq('track', 'InitiateCheckout', {
          content_ids: getCart().map((item) => String(item.productId)),
          content_type: 'product',
          value: getCartTotal(),
          currency: 'PKR',
        });
      }

      const modal = document.getElementById('cartCheckoutModal');
      if (modal) {
        modal.classList.add('open');
      }
    });
  }

  const checkoutWhatsAppBtn = document.getElementById('checkoutWhatsAppBtn');
  if (checkoutWhatsAppBtn) {
    checkoutWhatsAppBtn.addEventListener('click', placeOrderOnWhatsApp);
  }

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-cart-action]');
    if (!toggle) return;

    const { cartAction, cartKey } = toggle.dataset;
    if (cartAction === 'increase') increaseQuantity(cartKey);
    if (cartAction === 'decrease') decreaseQuantity(cartKey);
    if (cartAction === 'remove') removeFromCart(cartKey);
    renderCart();
  });

  if (drawer) {
    drawer.addEventListener('click', (event) => {
      if (event.target === drawer) closeCartDrawer();
    });
  }
}

function openCartDrawer() {
  ensureCartMarkup();
  renderCart();
  const drawer = document.getElementById('cartDrawer');
  if (drawer) {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
}

function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
}

function renderCart() {
  ensureCartMarkup();
  const cart = getCart();
  const container = document.getElementById('cartItemsContainer');
  const totalPrice = document.getElementById('cartTotalPrice');

  if (!container || !totalPrice) return;

  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <div class="cart-empty-icon">🛒</div>
        <h3>Your Cart is Empty</h3>
        <p>Add some products to your cart.</p>
        <button type="button" class="btn btn-primary cart-continue-btn" data-cart-close="true">Continue Shopping</button>
      </div>
    `;
    totalPrice.textContent = 'Rs. 0';
    const continueButton = container.querySelector('.cart-continue-btn');
    if (continueButton) {
      continueButton.addEventListener('click', closeCartDrawer);
    }
    return;
  }

  container.innerHTML = cart.map((item) => {
    const subtotal = Number(item.price || 0) * Number(item.quantity || 1);
    const imageUrl = item.image ? (item.image.startsWith('http') ? item.image : `${window.location.origin}${item.image.startsWith('/') ? item.image : `/${item.image}`}`) : 'https://via.placeholder.com/200x200/111111/888888?text=No+Image';

    return `
      <div class="cart-item">
        <div class="cart-item-image-wrap">
          <img src="${imageUrl}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/200x200/111111/888888?text=No+Image'" />
        </div>
        <div class="cart-item-content">
          <div class="cart-item-header">
            <div>
              <h3>${item.name}</h3>
              ${(item.selectedColor || item.selectedSize) ? `<p class="cart-item-variant">${[item.selectedColor, item.selectedSize].filter(Boolean).join(' / ')}</p>` : ''}
            </div>
            <button type="button" class="cart-item-remove" data-cart-action="remove" data-cart-key="${item.cartKey}">Remove</button>
          </div>
          <div class="cart-item-meta">
            <span class="cart-item-price">${formatPrice(item.price)}</span>
            <div class="cart-controls">
              <button type="button" class="cart-control-btn" data-cart-action="decrease" data-cart-key="${item.cartKey}" aria-label="Decrease quantity">−</button>
              <span class="cart-quantity-value">${item.quantity}</span>
              <button type="button" class="cart-control-btn" data-cart-action="increase" data-cart-key="${item.cartKey}" aria-label="Increase quantity">+</button>
            </div>
          </div>
          <div class="cart-item-subtotal">
            <span>Subtotal</span>
            <strong>${formatPrice(subtotal)}</strong>
          </div>
        </div>
      </div>
    `;
  }).join('');

  totalPrice.textContent = formatPrice(getCartTotal());
  updateCartUI();
}

function updateCartUI() {
  const count = getCartCount();
  document.querySelectorAll('.nav-cart-badge').forEach((badge) => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

function formatPrice(value) {
  const safeValue = Number(value || 0);
  return `Rs. ${safeValue.toLocaleString('en-PK')}`;
}

function buildWhatsAppCartMessage(cartItems) {
  const total = getCartTotal();
  const lines = cartItems.map((item, index) => {
    const subtotal = Number(item.price || 0) * Number(item.quantity || 1);
    return `${index + 1}. ${item.name}\nQuantity: ${item.quantity}\nPrice: ${formatPrice(item.price)}\nSubtotal: ${formatPrice(subtotal)}`;
  }).join('\n\n');

  return `Hello RW Store, I want to place an order.\n\nOrder Items:\n\n${lines}\n\nTotal: ${formatPrice(total)}`;
}

function placeOrderOnWhatsApp() {
  const cartItems = getCart();
  if (!cartItems.length) {
    if (typeof showToast === 'function') showToast('Your cart is empty.', 'error');
    return;
  }

  if (window.fbq) {
    fbq('track', 'InitiateCheckout', {
      content_ids: cartItems.map((item) => String(item.productId)),
      content_type: 'product',
      value: getCartTotal(),
      currency: 'PKR',
    });
  }

  const text = encodeURIComponent(buildWhatsAppCartMessage(cartItems));
  const target = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
  window.open(target, '_blank', 'noopener');
  clearCart();
  closeCartDrawer();
}

async function handleCartCheckoutSubmit(event) {
  event.preventDefault();

  const submitButton = event.target.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;

  const cartItems = getCart();
  if (!cartItems.length) {
    if (typeof showToast === 'function') showToast('Your cart is empty.', 'error');
    return;
  }

  const customer = {
    name: document.getElementById('cartCustomerName').value.trim(),
    phone: document.getElementById('cartCustomerPhone').value.trim(),
    city: document.getElementById('cartCustomerCity').value.trim(),
    address: document.getElementById('cartCustomerAddress').value.trim(),
  };
  const riderNote = document.getElementById('cartRiderNote')?.value.trim() || '';

  if (!customer.name || !customer.phone || !customer.city || !customer.address) {
    if (typeof showToast === 'function') showToast('Please enter all delivery details.', 'error');
    return;
  }

  const payload = {
    customer,
    items: cartItems.map((item) => ({
      productId: String(item.productId || '').trim(),
      name: String(item.name || 'Product').trim(),
      price: Number(item.price || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
      image: item.image || '',
      selectedColor: item.selectedColor || '',
      selectedSize: item.selectedSize || '',
    })),
    totalAmount: getCartTotal(),
    paymentMethod: 'COD',
    status: 'Pending',
    notes: riderNote,
  };

  const invalidItem = payload.items.find((item) => !item.productId);
  if (invalidItem) {
    if (typeof showToast === 'function') showToast('A cart product is missing its ID. Please remove it and add it again.', 'error');
    return;
  }

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Placing Order...';
    }

    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || 'Failed to place COD order');
    }

    const modal = document.getElementById('cartCheckoutModal');
    if (modal) modal.classList.remove('open');

    const successModal = document.getElementById('cartSuccessModal');
    const detailsContainer = document.getElementById('cartSuccessDetails');
    if (detailsContainer) {
      const order = result.data || {};
      const items = Array.isArray(order.items) && order.items.length ? order.items : cartItems;
      detailsContainer.innerHTML = `
        <div class="success-details">
          <p><strong>Order ID:</strong> ${order._id || 'N/A'}</p>
          <p><strong>Products:</strong> ${items.length}</p>
          <p><strong>Total:</strong> ${formatPrice(order.totalAmount || getCartTotal())}</p>
          <p><strong>Status:</strong> ${order.status || order.orderStatus || 'Pending'}</p>
        </div>
      `;
    }

    if (successModal) {
      successModal.classList.add('open');
    }

    if (typeof showToast === 'function') {
      showToast('COD order placed successfully!', 'success');
    }

    clearCart();
    event.target.reset();
  } catch (error) {
    if (typeof showToast === 'function') showToast(error.message, 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Confirm COD Order';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureCartMarkup();
  updateCartUI();
  renderCart();

  const navCartButtons = document.querySelectorAll('.nav-cart');
  navCartButtons.forEach((button) => {
    button.addEventListener('click', openCartDrawer);
  });
});
