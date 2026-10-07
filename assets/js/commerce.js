const shopAccount = {
  user: null, csrf: window.LEBROSTONE_COMMERCE?.csrf || '', ready: false,
  authMode: 'login', returnRoute: 'account', coupon: '', checkoutAddress: null,
  pendingOrder: null, preferenceTimer: null, preferenceChain: Promise.resolve(),
  preferenceRevision: 0, loadingRevision: 0, adminProducts: [], editingProduct: null,
};
const commerceEndpoint = window.LEBROSTONE_COMMERCE?.endpoint || 'api.php';

async function shopApi(action, method = 'GET', body) {
  const headers = { Accept: 'application/json' };
  const options = { method, credentials: 'same-origin', headers };
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = shopAccount.csrf;
    if (body instanceof FormData) options.body = body;
    else { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body || {}); }
  }
  let response;
  try { response = await fetch(`${commerceEndpoint}?action=${encodeURIComponent(action)}`, options); }
  catch { throw new Error('Unable to connect. Please check your connection and try again.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The store is temporarily unavailable. Please try again.'); }
  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status; throw error;
  }
  if (result.data?.csrf) shopAccount.csrf = result.data.csrf;
  return result.data;
}

function cartOwner(value) {
  try {
    if (value === undefined) return localStorage.getItem('lebrostone-cart-owner');
    if (value === null) localStorage.removeItem('lebrostone-cart-owner');
    else localStorage.setItem('lebrostone-cart-owner', String(value));
  } catch { return null; }
}

async function acceptShopSession(data) {
  const guestCart = state.cart, guestWishlist = [...state.wishlist], owner = cartOwner();
  shopAccount.user = data.user;
  if (data.user) {
    const merge = !owner || owner === String(data.user.id);
    const combined = { ...data.cart };
    if (merge) for (const [id, qty] of Object.entries(guestCart)) combined[id] = Math.max(qty, combined[id] || 0);
    state.cart = normalizeCart(combined);
    state.wishlist = new Set(normalizeWishlist([...(data.wishlist || []), ...(merge ? guestWishlist : [])]));
    cartOwner(data.user.id);
  } else if (owner) {
    state.cart = {}; state.wishlist = new Set(); cartOwner(null);
  }
  saveToStorage(); updateCounts(); renderCart();
  if (data.user) await flushPreferences().catch(error => showToast(error.message));
  const accountButton = document.querySelector('.account-button');
  accountButton?.setAttribute('aria-label', data.user ? `Account for ${data.user.name}` : 'Sign in or create an account');
}

window.queuePreferenceSave = function () {
  if (!shopAccount.ready || !shopAccount.user) return;
  shopAccount.preferenceRevision++;
  clearTimeout(shopAccount.preferenceTimer);
  shopAccount.preferenceTimer = setTimeout(() => flushPreferences().catch(error => showToast(error.message)), 350);
};

async function flushPreferences() {
  clearTimeout(shopAccount.preferenceTimer);
  if (!shopAccount.user) return;
  const userId = shopAccount.user.id, revision = shopAccount.preferenceRevision;
  const payload = { cart: { ...state.cart }, wishlist: [...state.wishlist] };
  const task = shopAccount.preferenceChain.catch(() => {}).then(() => shopApi('preferences', 'PUT', payload));
  shopAccount.preferenceChain = task;
  const result = await task;
  if (shopAccount.user?.id === userId && revision === shopAccount.preferenceRevision) {
    state.cart = normalizeCart(result.cart); state.wishlist = new Set(normalizeWishlist(result.wishlist));
    try {
      localStorage.setItem('lebrostone-cart', JSON.stringify(state.cart));
      localStorage.setItem('lebrostone-wishlist', JSON.stringify([...state.wishlist]));
    } catch {}
    updateCounts(); renderCart();
  }
}

async function refreshCatalogue() {
  const catalogue = await shopApi('catalogue');
  products.splice(0, products.length, ...catalogue);
  categories.splice(0, categories.length, 'All', ...new Set(products.map(product => product.category)));
  state.cart = normalizeCart(state.cart); state.wishlist = new Set(normalizeWishlist([...state.wishlist]));
  updateCounts(); renderCart();
}

function shopMoney(paise) { return money(Number(paise) / 100); }
function shopDate(value) { return new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
function statusBadge(value) { return `<span class="order-status status-${escapeHtml(value)}">${escapeHtml(value)}</span>`; }
function shopFrame(title, content, intro = '') {
  return `<section class="section commerce-page"><div class="container">
    <header class="commerce-heading"><p class="eyebrow">Lebrostone</p><h1>${escapeHtml(title)}</h1>${intro ? `<p>${escapeHtml(intro)}</p>` : ''}</header>
    ${content}</div></section>${footerMarkup()}`;
}
function shopError(message) { return `<p class="form-message is-error" role="alert">${escapeHtml(message)}</p>`; }
function accountNav() {
  return `<nav class="account-nav" aria-label="Account navigation"><a href="#account" data-route="account">My account</a>
    <a href="#orders" data-route="orders">My orders</a><button type="button" data-account-wishlist>Saved items</button>
    ${shopAccount.user?.role === 'admin' ? '<a href="#admin" data-route="admin">Admin panel</a>' : ''}
    <button type="button" data-account-logout>Sign out</button></nav>`;
}
function field(name, label, value = '', type = 'text', extra = '') {
  return `<label class="shop-field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`;
}
function formMessage(form, message, error = true) {
  const target = form.querySelector('[data-form-message]');
  if (target) { target.textContent = message; target.classList.toggle('is-error', error); target.hidden = !message; }
}

function pendingOrderStorage(value) {
  try {
    if (value === undefined) {
      const saved = JSON.parse(localStorage.getItem('lebrostone-order-request'));
      if (saved && /^[a-f0-9]{40}$/.test(saved.key) && /^[a-f0-9]{64}$/.test(saved.fingerprint) && Number.isInteger(saved.userId)) return saved;
      return null;
    }
    if (value === null) localStorage.removeItem('lebrostone-order-request');
    else localStorage.setItem('lebrostone-order-request', JSON.stringify(value));
  } catch { return null; }
}

async function orderFingerprint(payload) {
  if (!globalThis.crypto?.subtle) throw new Error('Use HTTPS to submit an order. Localhost also supports checkout.');
  const address = {};
  for (const field of ['name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode']) address[field] = String(payload.address[field] || '').trim();
  address.phone = address.phone.replace(/[\s()+-]/g, '');
  if (address.phone.length === 12 && address.phone.startsWith('91')) address.phone = address.phone.slice(2);
  const cart = Object.fromEntries(Object.entries(payload.cart).sort(([a], [b]) => a.localeCompare(b)));
  const canonical = JSON.stringify({cart, address, coupon: payload.coupon.trim().toUpperCase()});
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function renderSignIn(next = 'account') {
  shopAccount.returnRoute = next;
  const register = shopAccount.authMode === 'register';
  pageRoot.innerHTML = shopFrame(register ? 'Create your account' : 'Welcome back', `<div class="auth-layout">
    <div class="auth-intro"><h2>Your care.<br>Your own space.</h2><p>Save your favourites, keep your bag across devices and follow every order.</p>
      <a class="secondary-button" href="#shop" data-route="shop">Explore the collection</a></div>
    <div class="shop-panel"><div class="auth-tabs"><button type="button" data-auth-mode="login" aria-pressed="${!register}">Sign in</button>
      <button type="button" data-auth-mode="register" aria-pressed="${register}">Create account</button></div>
      <form data-shop-form="${register ? 'register' : 'login'}" class="shop-form">
        ${register ? field('name', 'Full name', '', 'text', 'required minlength="2" maxlength="100" autocomplete="name"') : ''}
        ${field('email', 'Email address', '', 'email', 'required maxlength="191" autocomplete="email"')}
        ${field('password', 'Password', '', 'password', `required ${register ? 'minlength="8"' : ''} maxlength="72" autocomplete="${register ? 'new-password' : 'current-password'}"`)}
        ${register ? '<p class="field-help">Use at least 8 characters for your password.</p>' : ''}
        <p data-form-message class="form-message" role="status" hidden></p>
        <button class="primary-button" type="submit">${register ? 'Create account' : 'Sign in'}</button>
      </form></div></div>`, next === 'checkout' ? 'Sign in to save your delivery details and submit your order.' : 'Everything for your everyday ritual, in one place.');
}

function renderAccount() {
  const user = shopAccount.user;
  pageRoot.innerHTML = shopFrame(`Hello, ${user.name}`, `${accountNav()}<div class="account-layout">
    <section class="shop-panel"><h2>Personal details</h2><form data-shop-form="profile" class="shop-form">
      ${field('name', 'Full name', user.name, 'text', 'required minlength="2" maxlength="100" autocomplete="name"')}
      ${field('email', 'Email address', user.email, 'email', 'readonly')}
      ${field('phone', 'Phone number', user.phone, 'tel', 'maxlength="20" autocomplete="tel"')}
      <p data-form-message class="form-message" role="status" hidden></p><button class="primary-button" type="submit">Save details</button>
    </form></section>
    <section class="shop-panel"><h2>Change password</h2><form data-shop-form="password" class="shop-form">
      ${field('current_password', 'Current password', '', 'password', 'required autocomplete="current-password"')}
      ${field('new_password', 'New password', '', 'password', 'required minlength="8" maxlength="72" autocomplete="new-password"')}
      <p data-form-message class="form-message" role="status" hidden></p><button class="secondary-button" type="submit">Update password</button>
    </form></section>
    <section class="shop-panel saved-address"><h2>Delivery address</h2>${user.address ? addressMarkup(user.address) : '<p>Your delivery address will be saved when you submit an order.</p>'}
      <a class="secondary-button" href="#checkout" data-route="checkout">Go to checkout</a></section>
    </div>`);
}

function addressMarkup(address) {
  return `<address>${escapeHtml(address.name)}<br>${escapeHtml(address.line1)}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ''}
    <br>${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.pincode)}<br>India<br>${escapeHtml(address.phone)}</address>`;
}

async function renderCheckout(revision) {
  await refreshCatalogue();
  if (!getCartItems().length) {
    pageRoot.innerHTML = shopFrame('Your bag is empty', '<div class="shop-panel empty-state"><p>Choose a few essentials before checking out.</p><a class="primary-button" href="#shop" data-route="shop">Shop products</a></div>'); return;
  }
  await flushPreferences();
  const quote = await shopApi('checkout/quote', 'POST', { cart: state.cart, coupon: shopAccount.coupon });
  if (revision !== shopAccount.loadingRevision || state.route !== 'checkout') return;
  const address = shopAccount.checkoutAddress || shopAccount.user.address || { name: shopAccount.user.name, phone: shopAccount.user.phone };
  pageRoot.innerHTML = shopFrame('Checkout', `<div class="checkout-layout">
    <section class="shop-panel"><h2>Delivery details</h2><form data-shop-form="checkout" class="shop-form">
      <div class="shop-form-grid">
        ${field('name', 'Recipient name', address.name, 'text', 'required minlength="2" maxlength="100" autocomplete="shipping name"')}
        ${field('phone', 'Mobile number', address.phone, 'tel', 'required maxlength="20" autocomplete="shipping tel"')}
      </div>
      ${field('line1', 'Address', address.line1, 'text', 'required minlength="2" maxlength="200" autocomplete="shipping address-line1"')}
      ${field('line2', 'Apartment, landmark (optional)', address.line2, 'text', 'maxlength="200" autocomplete="shipping address-line2"')}
      <div class="shop-form-grid">
        ${field('city', 'City', address.city, 'text', 'required minlength="2" maxlength="100" autocomplete="shipping address-level2"')}
        ${field('state', 'State', address.state, 'text', 'required minlength="2" maxlength="100" autocomplete="shipping address-level1"')}
        ${field('pincode', 'PIN code', address.pincode, 'text', 'required pattern="[1-9][0-9]{5}" inputmode="numeric" maxlength="6" autocomplete="shipping postal-code"')}
        ${field('country', 'Country', 'India', 'text', 'readonly')}
      </div>
      <p class="field-help">Review your delivery details and order total before submitting. The store will confirm your order.</p>
      <label class="shop-check"><input type="checkbox" name="accept_terms" required> I have reviewed the <a href="#terms-conditions" data-route="terms-conditions">store terms</a> and <a href="#return-policy" data-route="return-policy">return policy</a>.</label>
      <p data-form-message class="form-message" role="status" hidden></p>
      <button class="primary-button" type="submit">Submit order &middot; ${shopMoney(quote.total_paise)}</button>
    </form></section>
    <aside class="shop-panel checkout-summary"><h2>Order summary</h2>
      ${quote.items.map(item => `<div class="checkout-line"><img src="${IMAGE_BASE}${escapeHtml(item.image)}" alt=""><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.size)} &middot; Qty ${item.quantity}</small></div><span>${shopMoney(item.unit_price_paise * item.quantity)}</span></div>`).join('')}
      ${totalsMarkup(quote)}
      <form class="coupon-form" data-shop-form="coupon">${field('coupon', 'Coupon code', shopAccount.coupon, 'text', 'maxlength="40"')}<button class="secondary-button" type="submit">Apply</button><p data-form-message class="form-message" role="status" hidden></p></form>
      <a href="#shop" class="text-link" data-route="shop">Continue shopping &rarr;</a>
    </aside></div>`, 'A few essentials, ready for your everyday ritual.');
}

function totalsMarkup(order) {
  return `<div class="order-totals"><div><span>Subtotal</span><span>${shopMoney(order.subtotal_paise)}</span></div>
    ${order.discount_paise ? `<div><span>Discount${order.coupon ? ` (${escapeHtml(order.coupon)})` : ''}</span><span>&minus;${shopMoney(order.discount_paise)}</span></div>` : ''}
    <div><span>Shipping</span><span>${order.shipping_paise ? shopMoney(order.shipping_paise) : 'Free'}</span></div>
    <div class="order-total"><strong>Total</strong><strong>${shopMoney(order.total_paise)}</strong></div></div>`;
}

function pagination(data, action) {
  return data.pages > 1 ? `<div class="shop-pagination"><button class="secondary-button" data-page-action="${action}" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${data.page} of ${data.pages}</span><button class="secondary-button" data-page-action="${action}" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Next</button></div>` : '';
}

function ordersTable(data, admin = false) {
  if (!data.orders.length) return '<div class="empty-state"><h2>No orders yet</h2><p>Orders will appear here once they are submitted.</p><a class="secondary-button" href="#shop" data-route="shop">Browse products</a></div>';
  return `<div class="shop-table-wrap"><table class="shop-table"><thead><tr><th>Order</th>${admin ? '<th>Customer</th>' : ''}<th>Date</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>
    ${data.orders.map(order => `<tr><td>${escapeHtml(order.order_number)}</td>${admin ? `<td>${escapeHtml(order.address.name)}<small>${escapeHtml(order.customer_email)}</small></td>` : ''}
      <td>${shopDate(order.created_at)}</td><td>${statusBadge(order.status)}</td><td>${shopMoney(order.total_paise)}</td><td><button class="text-link" data-order-view="${escapeHtml(order.order_number)}">View order</button></td></tr>`).join('')}
    </tbody></table></div>${pagination(data, admin ? 'admin-orders' : 'orders')}`;
}

async function pagedApi(action, page) {
  const response = await fetch(`${commerceEndpoint}?action=${encodeURIComponent(action)}&page=${Number(page) || 1}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to load this page.'); return result.data;
}

async function renderOrder(revision) {
  if (!state.orderNumber) throw new Error('Choose an order from your order history.');
  const order = await shopApi(`orders/${state.orderNumber}`);
  if (revision !== shopAccount.loadingRevision || state.route !== 'order') return;
  const admin = shopAccount.user.role === 'admin';
  const flow = { pending: ['confirmed', 'cancelled'], confirmed: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
  const next = flow[order.status] || [];
  pageRoot.innerHTML = shopFrame(order.order_number, `${accountNav()}<div class="order-detail-layout">
    <section class="shop-panel"><div class="order-detail-heading"><h2>Order details</h2>${statusBadge(order.status)}</div><p>Submitted ${shopDate(order.created_at)}</p>
      ${order.items.map(item => `<div class="checkout-line"><img src="${IMAGE_BASE}${escapeHtml(item.image)}" alt=""><div><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.size)} &middot; Qty ${item.quantity}</small></div><span>${shopMoney(item.unit_price_paise * item.quantity)}</span></div>`).join('')}
      ${totalsMarkup(order)}
      ${!admin && ['pending', 'confirmed'].includes(order.status) ? `<button class="secondary-button danger-button" data-order-cancel="${escapeHtml(order.order_number)}">Cancel order</button>` : ''}
      <p class="form-message" data-order-message role="status" hidden></p>
    </section><aside class="shop-panel"><h2>Delivery address</h2>${addressMarkup(order.address)}
      ${order.tracking_number ? `<p><strong>Tracking number</strong><br>${escapeHtml(order.tracking_number)}</p>` : ''}
      <h3>Order progress</h3><ol class="order-timeline">${order.events.map(event => `<li><strong>${escapeHtml(event.status)}</strong><span>${shopDate(event.created_at)}</span></li>`).join('')}</ol>
      ${admin && next.length ? `<form data-shop-form="order-status" data-order="${escapeHtml(order.order_number)}" class="shop-form"><h3>Update order</h3>
        <label class="shop-field"><span>Next status</span><select name="status">${next.map(status => `<option value="${status}">${status}</option>`).join('')}</select></label>
        ${field('tracking_number', 'Tracking number (required when shipping)', order.tracking_number, 'text', 'maxlength="100"')}
        <p data-form-message class="form-message" role="status" hidden></p><button class="primary-button" type="submit">Update order</button></form>` : ''}
    </aside></div>`);
}

function adminNav() {
  return `<nav class="admin-nav" aria-label="Admin sections">${[['dashboard', 'Overview'], ['products', 'Products'], ['orders', 'Orders'], ['customers', 'Customers']].map(([tab, label]) =>
    `<button type="button" data-admin-tab="${tab}" aria-current="${state.adminTab === tab ? 'page' : 'false'}">${label}</button>`).join('')}<a href="#account" data-route="account">My account</a></nav>`;
}

async function renderAdmin(revision, page = 1) {
  if (shopAccount.user.role !== 'admin') throw new Error('Administrator access is required.');
  const tab = state.adminTab;
  let content;
  if (tab === 'products') {
    shopAccount.adminProducts = await shopApi('admin/products');
    content = `<section class="shop-panel"><div class="admin-section-heading"><h2>Products</h2><button class="primary-button" data-product-create>Create product</button></div>
      ${field('product_search', 'Find a product', '', 'search', 'data-admin-search placeholder="Search by name or category"')}
      <div data-admin-product-table>${adminProductsTable()}</div></section><div data-product-editor></div>`;
  } else if (tab === 'orders') {
    content = `<section class="shop-panel"><h2>Orders</h2>${ordersTable(await pagedApi('admin/orders', page), true)}</section>`;
  } else if (tab === 'customers') {
    const data = await pagedApi('admin/customers', page);
    content = `<section class="shop-panel"><h2>Customers</h2><div class="shop-table-wrap"><table class="shop-table"><thead><tr><th>Customer</th><th>Email</th><th>Orders</th><th>Status</th><th></th></tr></thead><tbody>
      ${data.customers.map(customer => `<tr><td>${escapeHtml(customer.name)}</td><td>${escapeHtml(customer.email)}</td><td>${customer.orders}</td><td>${Number(customer.active) ? 'Active' : 'Disabled'}</td>
        <td><button class="text-link" data-customer-toggle="${customer.id}" data-active="${Number(customer.active) ? 0 : 1}">${Number(customer.active) ? 'Disable' : 'Enable'}</button></td></tr>`).join('') || '<tr><td colspan="5">No customers yet.</td></tr>'}
      </tbody></table></div>${pagination(data, 'admin-customers')}</section>`;
  } else {
    const summary = await shopApi('admin/summary');
    content = `<div class="admin-stats">${[['Active products', summary.products], ['Customers', summary.customers], ['Orders', summary.orders], ['Awaiting confirmation', summary.pending]].map(([label, value]) => `<article class="shop-panel"><span>${label}</span><strong>${value}</strong></article>`).join('')}</div>
      <section class="shop-panel"><h2>Order value</h2><p class="admin-order-value">${shopMoney(summary.order_value_paise)}</p><p>Total value of orders excluding cancellations.</p>
        <button class="secondary-button" data-admin-tab="orders">Manage orders</button></section>`;
  }
  if (revision !== shopAccount.loadingRevision || state.route !== 'admin' || state.adminTab !== tab) return;
  pageRoot.innerHTML = shopFrame('Store administration', `${adminNav()}${content}`, 'Manage your catalogue, stock, customers and orders.');
}

function adminProductsTable(search = '') {
  const needle = search.toLowerCase();
  const rows = shopAccount.adminProducts.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(needle));
  return `<div class="shop-table-wrap"><table class="shop-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Visibility</th><th></th></tr></thead><tbody>
    ${rows.map(product => `<tr><td><div class="admin-product-name"><img src="${IMAGE_BASE}${escapeHtml(product.image)}" alt=""><span>${escapeHtml(product.name)}<small>${escapeHtml(product.size)}</small></span></div></td>
      <td>${escapeHtml(product.category)}</td><td>${money(product.price)}</td><td>${product.stockQty === null ? 'Not tracked' : product.stockQty}</td><td>${product.active ? 'Visible' : 'Archived'}</td>
      <td><button class="text-link" data-product-edit="${escapeHtml(product.id)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6">No matching products.</td></tr>'}</tbody></table></div>`;
}

function variantFields(pack = {}) {
  return `<div class="admin-variant" data-variant-row data-sku="${escapeHtml(pack.id || '')}">
    ${field('variant_size', 'Pack size', pack.size, 'text', 'data-variant-field="size" required maxlength="100"')}
    ${field('variant_price', 'Selling price (₹)', pack.price ?? '', 'number', 'data-variant-field="price" required min="0" step="0.01"')}
    ${field('variant_mrp', 'MRP (₹)', pack.mrp ?? '', 'number', 'data-variant-field="mrp" required min="0" step="0.01"')}
    ${field('variant_stock', 'Stock (blank = untracked)', pack.stockQty ?? '', 'number', 'data-variant-field="stockQty" min="0" step="1"')}
    <label class="shop-check"><input type="checkbox" data-variant-field="inStock" ${pack.inStock !== false ? 'checked' : ''}> Available</label>
    <button class="text-link danger-button" type="button" data-variant-remove>Remove pack</button></div>`;
}

function renderProductEditor(product = null) {
  shopAccount.editingProduct = product;
  const p = product || { name: '', category: '', price: '', mrp: '', size: '', description: '', image: '', badge: '', active: true, inStock: true, variants: [], details: [] };
  const editor = pageRoot.querySelector('[data-product-editor]');
  editor.innerHTML = `<section class="shop-panel product-editor"><div class="admin-section-heading"><h2>${product ? 'Edit product' : 'Create product'}</h2><button type="button" class="text-link" data-editor-close>Close</button></div>
    <form class="shop-form" data-shop-form="product"><div class="shop-form-grid">
      ${field('name', 'Product name', p.name, 'text', 'required minlength="2" maxlength="255"')}
      ${field('category', 'Category', p.category, 'text', 'required minlength="2" maxlength="191" list="adminCategories"')}
      <datalist id="adminCategories">${categories.filter(category => category !== 'All').map(category => `<option value="${escapeHtml(category)}">`).join('')}</datalist>
      ${field('price', 'Selling price (₹)', p.price, 'number', 'required min="0" max="9999999" step="0.01"')}
      ${field('mrp', 'MRP (₹)', p.mrp, 'number', 'required min="0" max="9999999" step="0.01"')}
      ${field('size', 'Main pack size', p.size, 'text', 'required maxlength="100"')}
      ${field('stockQty', 'Stock quantity (blank = untracked)', p.stockQty ?? '', 'number', 'min="0" max="10000000" step="1"')}
      ${field('badge', 'Badge (optional)', p.badge, 'text', 'maxlength="60"')}
    </div>
    <label class="shop-field"><span>Description</span><textarea name="description" rows="4" maxlength="5000">${escapeHtml(p.description)}</textarea></label>
    ${field('highlight', 'Highlights', p.details?.[0], 'text', 'maxlength="500"')}
    ${field('care', 'Care instructions', p.details?.[2], 'text', 'maxlength="1000"')}
    <div class="admin-photo">${p.image ? `<img data-photo-preview src="${IMAGE_BASE}${escapeHtml(p.image)}" alt="Product photo">` : '<img data-photo-preview alt="Product photo" hidden>'}
      <input type="hidden" name="image" value="${escapeHtml(p.image)}"><label class="shop-field"><span>Product photo (JPEG, PNG or WebP)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" ${p.image ? '' : 'required'}></label></div>
    <div class="shop-form-grid"><label class="shop-check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Show in store (uncheck to archive)</label>
      <label class="shop-check"><input type="checkbox" name="inStock" ${p.inStock ? 'checked' : ''}> Available for orders</label></div>
    <h3>Additional pack sizes</h3><div data-variant-list>${(p.variants || []).filter(pack => pack.id !== p.sourceVariantId).map(variantFields).join('')}</div>
    <button type="button" class="secondary-button" data-variant-add>Add pack size</button>
    <p data-form-message class="form-message" role="status" hidden></p><button class="primary-button" type="submit">Save product</button>
    </form></section>`;
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.renderCommercePage = async function (route, page = 1) {
  const revision = ++shopAccount.loadingRevision;
  document.title = `${({ account: 'My account', orders: 'My orders', order: 'Order details', checkout: 'Checkout', admin: 'Administration' })[route]} | Lebrostone`;
  pageRoot.innerHTML = shopFrame('One moment', '<p role="status">Loading…</p>');
  try {
    await shopSessionReady;
    if (revision !== shopAccount.loadingRevision || state.route !== route) return;
    if (!shopAccount.user) { renderSignIn(route === 'order' ? 'orders' : route); return; }
    if (route === 'account') renderAccount();
    else if (route === 'checkout') await renderCheckout(revision);
    else if (route === 'orders') {
      const data = await pagedApi('orders', page);
      if (revision === shopAccount.loadingRevision && state.route === 'orders') pageRoot.innerHTML = shopFrame('My orders', `${accountNav()}<section class="shop-panel">${ordersTable(data)}</section>`);
    } else if (route === 'order') await renderOrder(revision);
    else if (route === 'admin') await renderAdmin(revision, page);
  } catch (error) {
    if (revision !== shopAccount.loadingRevision || state.route !== route) return;
    if (error.status === 401) { shopAccount.user = null; renderSignIn(route === 'order' ? 'orders' : route); return; }
    pageRoot.innerHTML = shopFrame('Unable to continue', `<section class="shop-panel">${shopError(error.message)}<button class="secondary-button" data-shop-retry>Try again</button><a class="text-link" href="#shop" data-route="shop">Browse products</a></section>`);
  }
};

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-shop-form]');
  if (!form) return;
  event.preventDefault();
  if (form.dataset.submitting || !form.reportValidity()) return;
  form.dataset.submitting = 'true';
  const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
  formMessage(form, '');
  const values = Object.fromEntries(new FormData(form));
  const action = form.dataset.shopForm;
  try {
    if (action === 'login' || action === 'register') {
      const data = await shopApi(action, 'POST', values); await acceptShopSession(data);
      navigate(shopAccount.returnRoute); showToast(action === 'register' ? 'Your account is ready' : 'Welcome back');
    } else if (action === 'profile') {
      const data = await shopApi('profile', 'PUT', { name: values.name, phone: values.phone, ...(shopAccount.user.address ? { address: shopAccount.user.address } : {}) });
      shopAccount.user = data.user; formMessage(form, 'Your details have been saved.', false);
    } else if (action === 'password') {
      await shopApi('password', 'POST', values); form.reset(); formMessage(form, 'Your password has been updated.', false);
    } else if (action === 'coupon') {
      const delivery = pageRoot.querySelector('[data-shop-form="checkout"]');
      if (delivery) shopAccount.checkoutAddress = Object.fromEntries(new FormData(delivery));
      await shopApi('checkout/quote', 'POST', { cart: state.cart, coupon: values.coupon });
      shopAccount.coupon = values.coupon; window.renderCommercePage('checkout');
    } else if (action === 'checkout') {
      shopAccount.checkoutAddress = values;
      await flushPreferences();
      const payload = { cart: { ...state.cart }, coupon: shopAccount.coupon, address: values, accept_terms: values.accept_terms === 'on' };
      const fingerprint = await orderFingerprint(payload);
      shopAccount.pendingOrder ||= pendingOrderStorage();
      if (!shopAccount.pendingOrder || shopAccount.pendingOrder.fingerprint !== fingerprint || shopAccount.pendingOrder.userId !== shopAccount.user.id) {
        shopAccount.pendingOrder = { fingerprint, userId: shopAccount.user.id, key: Array.from(crypto.getRandomValues(new Uint8Array(20)), byte => byte.toString(16).padStart(2, '0')).join('') };
        pendingOrderStorage(shopAccount.pendingOrder);
      }
      payload.request_key = shopAccount.pendingOrder.key;
      const order = await shopApi('orders', 'POST', payload);
      state.cart = {}; saveToStorage(); shopAccount.coupon = ''; shopAccount.pendingOrder = null; pendingOrderStorage(null);
      shopAccount.user.address = order.address; shopAccount.user.phone = order.address.phone;
      updateCounts(); renderCart();
      navigate('order', { orderNumber: order.order_number }); showToast('Your order has been submitted');
      await refreshCatalogue().catch(error => showToast(error.message));
    } else if (action === 'order-status') {
      await shopApi(`admin/orders/${form.dataset.order}`, 'PUT', values); window.renderCommercePage('order'); showToast('Order updated');
    } else if (action === 'product') {
      if (values.photo?.size) {
        const photoData = new FormData(); photoData.append('photo', values.photo);
        const uploaded = await shopApi('admin/upload', 'POST', photoData); values.image = uploaded.image;
        form.elements.image.value = uploaded.image;
      }
      const variants = [...form.querySelectorAll('[data-variant-row]')].map(row => {
        const pack = { id: row.dataset.sku };
        row.querySelectorAll('[data-variant-field]').forEach(input => { pack[input.dataset.variantField] = input.type === 'checkbox' ? input.checked : input.value; });
        return pack;
      });
      const id = shopAccount.editingProduct?.id;
      await shopApi(id ? `admin/products/${id}` : 'admin/products', id ? 'PUT' : 'POST', {
        ...values, photo: undefined, active: values.active === 'on', inStock: values.inStock === 'on', variants,
        revision: shopAccount.editingProduct?.revision,
      });
      window.renderCommercePage('admin'); showToast('Product saved');
      await refreshCatalogue().catch(error => showToast(error.message));
    }
  } catch (error) { formMessage(form, error.message); }
  finally { delete form.dataset.submitting; if (button) button.disabled = false; }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-auth-mode], [data-account-logout], [data-account-wishlist], [data-order-view], [data-order-cancel], [data-admin-tab], [data-product-create], [data-product-edit], [data-editor-close], [data-variant-add], [data-variant-remove], [data-customer-toggle], [data-page-action], [data-shop-retry]');
  if (!button || button.disabled) return;
  event.preventDefault();
  try {
    if (button.hasAttribute('data-auth-mode')) { shopAccount.authMode = button.dataset.authMode; renderSignIn(shopAccount.returnRoute); }
    else if (button.hasAttribute('data-account-logout')) {
      button.disabled = true; await flushPreferences(); await shopApi('logout', 'POST');
      shopAccount.user = null; state.cart = {}; state.wishlist = new Set(); cartOwner(null); saveToStorage(); updateCounts(); renderCart(); navigate('account');
    } else if (button.hasAttribute('data-account-wishlist')) navigate('shop', { savedOnly: true, category: 'All' });
    else if (button.hasAttribute('data-order-view')) navigate('order', { orderNumber: button.dataset.orderView });
    else if (button.hasAttribute('data-order-cancel')) {
      button.disabled = true; await shopApi(`orders/${button.dataset.orderCancel}`, 'PUT', { status: 'cancelled' });
      await refreshCatalogue(); window.renderCommercePage('order'); showToast('Order cancelled');
    } else if (button.hasAttribute('data-admin-tab')) navigate('admin', { adminTab: button.dataset.adminTab });
    else if (button.hasAttribute('data-product-create')) renderProductEditor();
    else if (button.hasAttribute('data-product-edit')) renderProductEditor(shopAccount.adminProducts.find(product => product.id === button.dataset.productEdit));
    else if (button.hasAttribute('data-editor-close')) pageRoot.querySelector('[data-product-editor]').innerHTML = '';
    else if (button.hasAttribute('data-variant-add')) pageRoot.querySelector('[data-variant-list]').insertAdjacentHTML('beforeend', variantFields());
    else if (button.hasAttribute('data-variant-remove')) button.closest('[data-variant-row]').remove();
    else if (button.hasAttribute('data-customer-toggle')) {
      button.disabled = true; await shopApi(`admin/customers/${button.dataset.customerToggle}`, 'PUT', { active: button.dataset.active === '1' }); window.renderCommercePage('admin');
    } else if (button.hasAttribute('data-page-action')) window.renderCommercePage(button.dataset.pageAction === 'orders' ? 'orders' : 'admin', Number(button.dataset.page));
    else if (button.hasAttribute('data-shop-retry')) {
      if (!shopAccount.ready) shopSessionReady = startShopSession();
      window.renderCommercePage(state.route);
    }
  } catch (error) { showToast(error.message); button.disabled = false; }
});

document.addEventListener('input', event => {
  if (event.target.matches('[data-admin-search]')) pageRoot.querySelector('[data-admin-product-table]').innerHTML = adminProductsTable(event.target.value);
  const checkout = event.target.closest('[data-shop-form="checkout"]');
  if (checkout) shopAccount.checkoutAddress = Object.fromEntries(new FormData(checkout));
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !shopAccount.ready) return;
  try {
    await refreshCatalogue();
    if (['home', 'shop', 'offers', 'categories', 'product'].includes(state.route)) renderCurrentRoute();
  } catch (error) { showToast(error.message); }
});

async function startShopSession() {
  const data = await shopApi('session'); shopAccount.ready = true; await acceptShopSession(data);
}
let shopSessionReady = startShopSession();
shopSessionReady.catch(error => { showToast(error.message); });
