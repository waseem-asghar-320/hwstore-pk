let allOrders = [];
let currentFilter = 'all';
let currentStatusFilter = 'all'; // New: status filter

const ORDER_FILTERS = {
  all: { label: 'All Orders', days: null },
  ten: { label: 'Last 10 Days', days: 10 },
  twenty: { label: 'Last 20 Days', days: 20 },
  month: { label: '1 Month', days: 30 },
};

document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  fetchOrders();
});

function initNavToggle() {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      toggle.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
      });
    });

    document.addEventListener('click', (event) => {
      if (!navLinks.contains(event.target) && !toggle.contains(event.target)) {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
      }
    });
  }
}

async function fetchOrders() {
  const container = document.getElementById('ordersContainer');
  showLoading(container);

  try {
    const response = await fetch(`${API_BASE_URL}/orders`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to fetch orders');
    }

    allOrders = result.data || [];
    renderOrders(allOrders, currentFilter, currentStatusFilter);
  } catch (error) {
    container.innerHTML = `<p class="error-message">${error.message}</p>`;
    showToast(error.message, 'error');
  }
}

function setOrderFilter(filter) {
  currentFilter = filter;
  renderOrders(allOrders, filter, currentStatusFilter);
}

// New: Set status filter
function setStatusFilter(status) {
  currentStatusFilter = status;
  renderOrders(allOrders, currentFilter, status);
}

// Modified: Filter orders by both date and status
function filterOrders(orders, filter, statusFilter) {
  // First filter by date
  const config = ORDER_FILTERS[filter] || ORDER_FILTERS.all;
  let filtered = orders;
  
  if (config.days) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - config.days);
    filtered = filtered.filter((order) => {
      const orderDate = new Date(order.orderDate);
      return orderDate >= threshold;
    });
  }

  // Then filter by status
  if (statusFilter !== 'all') {
    filtered = filtered.filter((order) => {
      if (statusFilter === 'pending') return order.orderStatus === 'Pending';
      if (statusFilter === 'processing') return order.orderStatus === 'Processing';
      if (statusFilter === 'completed') return order.orderStatus === 'Delivered' || order.orderStatus === 'Completed';
      if (statusFilter === 'canceled') return order.orderStatus === 'Cancelled';
      return true;
    });
  }

  return filtered;
}

function updateOrderStats(orders) {
  const total = orders.length;
  const pending = orders.filter(o => o.orderStatus === 'Pending').length;
  const processing = orders.filter(o => o.orderStatus === 'Processing').length;
  const completed = orders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'Completed').length;
  const canceled = orders.filter(o => o.orderStatus === 'Cancelled').length;

  document.getElementById('totalOrders').textContent = total;
  document.getElementById('pendingOrders').textContent = pending;
  document.getElementById('processingOrders').textContent = processing;
  document.getElementById('canceledOrders').textContent = canceled;
  document.getElementById('completedOrders').textContent = completed;
}

function getStatusClass(status) {
  const map = {
    'Pending': 'status-pending',
    'Processing': 'status-processing',
    'Delivered': 'status-completed',
    'Completed': 'status-completed',
    'Cancelled': 'status-cancelled'
  };
  return map[status] || 'status-pending';
}

function renderOrders(orders, filter = currentFilter, statusFilter = currentStatusFilter) {
  const container = document.getElementById('ordersContainer');
  const filteredOrders = filterOrders(orders, filter, statusFilter);
  const summaryConfig = ORDER_FILTERS[filter] || ORDER_FILTERS.all;
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);
  const statusOptions = ['Pending', 'Processing', 'Delivered', 'Cancelled'];

  // Update stats
  updateOrderStats(orders);

  // Filter buttons (date filters)
  const filterButtons = Object.entries(ORDER_FILTERS)
    .map(([key, config]) => {
      const activeClass = filter === key ? 'active' : '';
      return `<button class="filter-chip ${activeClass}" onclick="setOrderFilter('${key}')">${config.label}</button>`;
    })
    .join('');

  // Status filter buttons (NEW)
  const statusFilterButtons = [
    { key: 'all', label: 'All Status' },
    { key: 'pending', label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'completed', label: 'Completed' },
    { key: 'canceled', label: 'Canceled' }
  ].map(({ key, label }) => {
    const activeClass = statusFilter === key ? 'active' : '';
    return `<button class="filter-chip status-chip ${activeClass}" onclick="setStatusFilter('${key}')">${label}</button>`;
  }).join('');

  if (filteredOrders.length === 0) {
    container.innerHTML = `
      <div class="filter-group">
        ${filterButtons}
      </div>
      <div class="filter-group status-filter-group">
        ${statusFilterButtons}
        <span class="filter-result">0 orders found</span>
      </div>
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No orders found</h3>
        <p>No orders match the current filter criteria.</p>
      </div>
    `;
    return;
  }

  // Build order cards
  const orderCards = filteredOrders.map((order) => {
    const statusClass = getStatusClass(order.orderStatus);
    const options = statusOptions
      .map((s) => `<option value="${s}" ${order.orderStatus === s ? 'selected' : ''}>${s}</option>`)
      .join('');

    return `
      <div class="order-card">
        <div class="order-card-header">
          <div class="order-id-wrapper">
            <span class="order-label">Order</span>
            <span class="order-id">#${order._id.slice(-8).toUpperCase()}</span>
          </div>
          <div class="order-header-right">
            <span class="order-date">${formatDate(order.orderDate)}</span>
            <span class="status-badge ${statusClass}">${order.orderStatus}</span>
          </div>
        </div>
        
        <div class="order-card-body">
          <div class="order-product-info">
            <div class="product-detail">
              <span class="detail-label">Product</span>
              <span class="detail-value product-name">${order.productName}</span>
            </div>
            <div class="product-detail">
              <span class="detail-label">Quantity</span>
              <span class="detail-value">×${order.quantity}</span>
            </div>
            ${order.color ? `<div class="product-detail">
              <span class="detail-label">Color</span>
              <span class="detail-value">${escapeHtml(order.color)}</span>
            </div>` : ''}
            <div class="product-detail">
              <span class="detail-label">Total</span>
              <span class="detail-value order-total">${formatPrice(order.totalPrice)}</span>
            </div>
          </div>
          
          <div class="order-customer-info">
            <div class="customer-detail">
              <span class="detail-label">Customer</span>
              <span class="detail-value">${order.customerName}</span>
            </div>
            <div class="customer-detail">
              <span class="detail-label">Phone</span>
              <span class="detail-value">${order.customerPhone}</span>
            </div>
            <div class="customer-detail full-width">
              <span class="detail-label">Delivery Address</span>
              <span class="detail-value address">${order.customerAddress}</span>
            </div>
          </div>
        </div>
        
        <div class="order-card-footer">
          <div class="order-actions">
            <select class="status-select" onchange="updateStatus('${order._id}', this.value)">
              ${options}
            </select>
            <button class="btn-delete" onclick="deleteOrder('${order._id}')" title="Delete order">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="filter-group">
      ${filterButtons}
    </div>
    <div class="filter-group status-filter-group">
      ${statusFilterButtons}
      <span class="filter-result">${filteredOrders.length} orders found</span>
    </div>

    <div class="summary-strip">
      <div class="summary-card">
        <span class="summary-label">Revenue (${summaryConfig.label})</span>
        <div class="summary-value">${formatPrice(totalRevenue)}</div>
      </div>
      <div class="summary-card">
        <span class="summary-label">Orders (${summaryConfig.label})</span>
        <div class="summary-value">${filteredOrders.length}</div>
      </div>
    </div>

    <div class="orders-grid">
      ${orderCards}
    </div>
  `;
}

async function updateStatus(orderId, status) {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to update status');
    }

    showToast('Order status updated!', 'success');
    fetchOrders();
  } catch (error) {
    showToast(error.message, 'error');
    fetchOrders();
  }
}

async function deleteOrder(orderId) {
  if (!confirm('Are you sure you want to delete this order?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, { method: 'DELETE' });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to delete order');
    }

    showToast('Order deleted successfully!', 'success');
    fetchOrders();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// CHANGED: Currency updated from $ to Rs
function formatPrice(price) {
  return `Rs ${Number(price).toFixed(2)}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => toast.classList.add('show'));
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showLoading(element) {
  if (element) {
    element.innerHTML = '<div class="loading-spinner"></div>';
  }
}