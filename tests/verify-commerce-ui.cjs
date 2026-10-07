// Exercises commerce rendering and form handlers with a DOM/API fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const elements = new Map(), listeners = {}, saved = new Map(), requests = [];
function element(key) {
  if (!elements.has(key)) elements.set(key, {
    innerHTML: '', textContent: '', dataset: {}, hidden: false, open: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, focus() {}, close() {}, scrollIntoView() {},
    querySelector(selector) { return element(key + ':' + selector); }, querySelectorAll() { return []; },
  });
  return elements.get(key);
}
class FixtureFormData {
  constructor(form) { this.values = Object.entries(form?.values || {}); }
  [Symbol.iterator]() { return this.values[Symbol.iterator](); }
  append(key, value) { this.values.push([key, value]); }
}
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'database/catalogue.json'), 'utf8'));
const user = { id: 1, name: 'Test customer', email: 'test@example.test', role: 'customer', phone: '', address: null };
const address = { name: user.name, line1: 'Test street', line2: '', city: 'Indore', state: 'Madhya Pradesh', pincode: '452016', phone: '9876543210', country: 'India' };
const item = { product_id: 'cream', sku: 'cream', name: catalogue[0].name, product_name: catalogue[0].name,
  image: catalogue[0].image, size: catalogue[0].size, quantity: 1, unit_price_paise: 18000 };
const quote = { items: [item], subtotal_paise: 18000, discount_paise: 0, shipping_paise: 0, total_paise: 18000, coupon: '' };
const order = { ...quote, id: 1, order_number: 'LB-TEST-123', status: 'pending', tracking_number: '', address,
  created_at: '2026-10-06 10:00:00', customer_email: user.email, events: [{status: 'pending', created_at: '2026-10-06 10:00:00'}] };
let remoteCart = { cream: 1 }, remoteWishlist = ['cream'];
const document = {
  body: element('body'), visibilityState: 'hidden', getElementById: element, querySelector: element,
  querySelectorAll: () => [], addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
};
document.body.dataset.assets = 'assets/';
const location = { hash: '#home' };
const window = {
  LEBROSTONE_CATALOGUE: catalogue, LEBROSTONE_COMMERCE: {csrf: 'a'.repeat(64), endpoint: 'api.php'}, location,
  setInterval() {}, clearInterval() {}, setTimeout() {}, addEventListener() {}, scrollTo() {}, matchMedia: () => ({matches: false}),
  alert() { throw new Error('Wishlist notifications must not open a browser alert'); },
  history: {pushState(_state, _title, hash) { location.hash = hash; }},
};
const context = vm.createContext({ window, document, location, URLSearchParams, Intl, Date, TextEncoder, crypto: webcrypto,
  FormData: FixtureFormData, setTimeout() {}, clearTimeout() {}, MutationObserver: class { observe() {} },
  localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
  async fetch(url, options = {}) {
    const parsed = new URL(url, 'http://localhost/'), action = parsed.searchParams.get('action');
    const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;
    requests.push({action, method: options.method || 'GET', body, headers: options.headers});
    let data;
    if (['session', 'login', 'register'].includes(action)) data = {user, csrf: 'b'.repeat(64), cart: remoteCart, wishlist: remoteWishlist};
    else if (action === 'preferences') { remoteCart = body.cart; remoteWishlist = body.wishlist; data = {cart: remoteCart, wishlist: remoteWishlist}; }
    else if (action === 'catalogue') data = catalogue;
    else if (action === 'checkout/quote') data = quote;
    else if (action === 'orders' && options.method === 'POST') data = order;
    else if (['orders', 'admin/orders'].includes(action)) data = {orders: [order], page: 1, pages: 1, total: 1};
    else if (action.startsWith('orders/') || action.startsWith('admin/orders/')) data = order;
    else if (action === 'admin/summary') data = {products: 113, customers: 1, orders: 1, pending: 1, order_value_paise: 18000};
    else if (action === 'admin/products') data = catalogue.map(product => ({...product, active: true, revision: 'test-revision'}));
    else if (action === 'admin/customers') data = {customers: [{...user, active: 1, orders: 1}], page: 1, pages: 1};
    else if (action === 'profile') data = {user: {...user, name: body.name}, csrf: 'b'.repeat(64)};
    else if (action === 'password') data = {csrf: 'c'.repeat(64)};
    else if (action === 'logout') data = {user: null, csrf: 'd'.repeat(64), cart: {}, wishlist: []};
    else throw new Error('Unexpected API call: ' + action);
    return {ok: true, json: async () => ({data: JSON.parse(JSON.stringify(data))})};
  },
});
for (const file of ['blogs.js', 'reviews.js', 'policies.js', 'app.js', 'commerce.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', file), 'utf8'), context);
}
function form(kind, values) {
  const message = {textContent: '', hidden: true, classList: {toggle() {}}}, submit = {disabled: false};
  return { dataset: {shopForm: kind}, values, reportValidity: () => true, closest: () => null,
    querySelector: selector => selector.includes('data-form-message') ? message : submit,
    querySelectorAll: () => [], reset() {}, message, submit };
}
async function submit(form) {
  form.closest = () => form;
  await listeners.submit.at(-1)({target: form, preventDefault() {}});
  assert.ok(!form.message.textContent || !form.message.textContent.includes('could not'), 'Form submission failed');
}
(async () => {
  await vm.runInContext('shopSessionReady', context);
  assert.equal(vm.runInContext('state.cart.cream', context), 1);
  vm.runInContext("renderProductPage('cream');", context);
  assert.ok(element('pageRoot').innerHTML.includes('data-buy-now="cream"'));
  assert.ok(element('cartSummary').innerHTML.includes('Proceed to checkout'));
  const storefrontClick = listeners.click[0];
  function clickButton(selector, dataset) {
    const button = {dataset, disabled: false, classList: {add() {}, remove() {}}};
    storefrontClick({target: {closest: value => value === selector ? button : null}});
  }
  clickButton('[data-buy-now]', {buyNow: 'cream'});
  assert.equal(vm.runInContext('state.route', context), 'checkout');
  assert.equal(vm.runInContext('state.cart.cream', context), 2);
  vm.runInContext("renderProductPage('balm');", context);
  assert.match(element('pageRoot').innerHTML, /data-pack="balm"[^>]*disabled/);
  clickButton('[data-pack]', {pack: 'balm'});
  assert.equal(vm.runInContext('state.route', context), 'checkout', 'Unavailable packs must not navigate');
  const availablePack = catalogue.flatMap(product => product.variants || []).find(pack => pack.inStock && pack.price > 0);
  assert.ok(availablePack, 'Fixture needs an available variant');
  clickButton('[data-pack]', {pack: availablePack.id});
  assert.equal(vm.runInContext('state.activeProduct', context), availablePack.id);
  assert.ok(location.hash.includes(encodeURIComponent(availablePack.id)));
  vm.runInContext('renderCurrentRoute();', context);
  assert.ok(element('pageRoot').innerHTML.includes(availablePack.size));
  clickButton('[data-wishlist]', {wishlist: 'cream'});
  assert.ok(element('toast').textContent.includes('removed from wishlist'));
  clickButton('[data-wishlist]', {wishlist: 'cream'});
  assert.ok(element('toast').textContent.includes('saved to wishlist'));
  for (const route of ['account', 'checkout', 'orders']) {
    vm.runInContext(`state.route = '${route}';`, context);
    await window.renderCommercePage(route);
    assert.ok(!element('pageRoot').innerHTML.includes('Unable to continue'), `${route} did not render`);
  }
  assert.ok(element('pageRoot').innerHTML.includes('LB-TEST-123'));
  vm.runInContext("state.route = 'checkout';", context); await window.renderCommercePage('checkout');
  assert.ok(element('pageRoot').innerHTML.includes('Delivery details'));
  assert.ok(!/Razorpay|Cash on delivery|Payment method/i.test(element('pageRoot').innerHTML));
  await submit(form('checkout', {...address, accept_terms: 'on'}));
  const submitted = requests.find(request => request.action === 'orders' && request.method === 'POST');
  assert.ok(submitted.body.accept_terms && submitted.body.request_key.length === 40);
  assert.equal(vm.runInContext('Object.keys(state.cart).length', context), 0);
  assert.equal(vm.runInContext('state.orderNumber', context), order.order_number);
  await window.renderCommercePage('order'); assert.ok(element('pageRoot').innerHTML.includes('Cancel order'));
  vm.runInContext("shopAccount.user.role = 'admin';", context);
  for (const tab of ['dashboard', 'products', 'orders', 'customers']) {
    vm.runInContext(`state.route = 'admin'; state.adminTab = '${tab}';`, context);
    await window.renderCommercePage('admin');
    assert.ok(!element('pageRoot').innerHTML.includes('Unable to continue'), `Admin ${tab} did not render`);
  }
  vm.runInContext("state.adminTab = 'products';", context); await window.renderCommercePage('admin');
  vm.runInContext('renderProductEditor(shopAccount.adminProducts[0]);', context);
  assert.ok(element('pageRoot:[data-product-editor]').innerHTML.includes('Save product'));
  vm.runInContext("shopAccount.user = null; state.route = 'account';", context); await window.renderCommercePage('account');
  assert.ok(element('pageRoot').innerHTML.includes('Welcome back'));
  await submit(form('login', {email: user.email, password: 'test-password'}));
  assert.equal(vm.runInContext('shopAccount.user.email', context), user.email);
  await submit(form('profile', {name: 'Updated customer', phone: '9876543210'}));
  assert.equal(vm.runInContext('shopAccount.user.name', context), 'Updated customer');
  await submit(form('password', {current_password: 'test-password', new_password: 'new-password'}));
  assert.equal(vm.runInContext('shopAccount.csrf', context), 'c'.repeat(64));
  for (const request of requests.filter(request => request.method !== 'GET')) assert.ok(request.headers['X-CSRF-Token']);
  console.log('Account, checkout, orders, admin screens, form submissions, saved-cart sync and CSRF headers: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
