// Checks generated HTML paths using a lightweight DOM fixture, not a visual browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key, {
    innerHTML: '', textContent: '', dataset: {}, open: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, focus() {}, close() {}, querySelectorAll() { return []; },
  });
  return elements.get(key);
}
const document = {
  body: element('body'), getElementById: element, querySelector: element,
  querySelectorAll: () => [], addEventListener() {},
};
document.body.dataset.assets = 'assets/';
const location = { hash: '#home' };
const window = {
  LEBROSTONE_CATALOGUE: JSON.parse(fs.readFileSync(path.join(root, 'database/catalogue.json'), 'utf8')),
  location, setInterval() {}, clearInterval() {}, setTimeout() {}, addEventListener() {},
  scrollTo() {}, matchMedia: () => ({ matches: false }),
  history: { pushState(_state, _title, hash) { location.hash = hash; } },
};
const context = vm.createContext({
  window, document, location, URLSearchParams, Intl, Date,
  localStorage: { getItem: () => null, setItem() {} }, setTimeout() {}, clearTimeout() {},
  MutationObserver: class { observe() {} },
});
for (const file of ['blogs.js', 'reviews.js', 'policies.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', file), 'utf8'), context);
}
let imageChecks = 0;
function checkImages(html) {
  for (const match of html.matchAll(/src="(assets\/images\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), `Missing rendered image: ${match[1]}`);
    imageChecks++;
  }
}
const routes = ['home', 'categories', 'shop', 'offers', 'journal', 'faq', 'about', 'support',
  'text-reviews', 'video-reviews', ...Object.keys(window.LEBROSTONE_POLICIES)];
for (const route of routes) {
  vm.runInContext(`state.route = ${JSON.stringify(route)}; renderCurrentRoute();`, context);
  checkImages(element('pageRoot').innerHTML);
}
vm.runInContext('renderCategoriesPage();', context);
vm.runInContext('renderJournalPage();', context);
assert.ok(!element('pageRoot').innerHTML.includes('href="https://lebrostone.com/blog/'));
for (const article of window.LEBROSTONE_BLOGS) {
  vm.runInContext(`navigate('article', {articleId: ${JSON.stringify(article.id)}}); renderCurrentRoute();`, context);
  assert.equal(vm.runInContext('locationRoute().options.articleId', context), article.id);
  assert.ok(element('pageRoot').innerHTML.includes(article.image));
  checkImages(element('pageRoot').innerHTML);
}
vm.runInContext("navigate('article', {articleId: 'missing'}); renderCurrentRoute();", context);
assert.ok(element('pageRoot').innerHTML.includes('Story unavailable'));
vm.runInContext('renderCategoriesPage();', context);
assert.equal((element('pageRoot').innerHTML.match(/class="collection-category"/g) || []).length, 9);
for (const product of window.LEBROSTONE_CATALOGUE) {
  vm.runInContext(`state.activeProduct = ${JSON.stringify(product.id)}; state.route = 'product'; renderCurrentRoute();`, context);
  checkImages(element('pageRoot').innerHTML);
  for (const variant of product.variants || []) {
    vm.runInContext(`renderProductPage(${JSON.stringify(variant.id)});`, context);
    checkImages(element('pageRoot').innerHTML);
  }
}
vm.runInContext("state.category = 'Skin Care'; state.search = ''; state.concern = ''; state.savedOnly = false; state.route = 'shop';", context);
assert.ok(vm.runInContext("getVisibleProducts().every(product => product.category === 'Skin Care')", context));
vm.runInContext("state.search = 'cream';", context);
assert.ok(vm.runInContext("getVisibleProducts().length > 0", context));
vm.runInContext("navigate('product', {productId: 'cream'}); navigate('product'); renderCurrentRoute();", context);
assert.equal(vm.runInContext('state.activeProduct', context), null);
assert.ok(element('pageRoot').innerHTML.includes('Product unavailable'));
vm.runInContext(`products.push({id: 'audit-product', name: '<img src=x onerror=alert(1)>',
  category: 'Audit & test', image: 'logo.png', description: '<script>alert(1)</script>', price: 10,
  mrp: 10, inStock: true, stockQty: null}); renderProductPage('audit-product');`, context);
assert.ok(!element('pageRoot').innerHTML.includes('<script>alert(1)</script>'));
assert.ok(element('pageRoot').innerHTML.includes('&lt;script&gt;'));
const card = vm.runInContext("productCard(getProduct('audit-product'))", context);
assert.ok(!card.includes('<img src=x'));
vm.runInContext("state.cart = {'audit-product': 1}; renderCart();", context);
assert.ok(!element('cartItems').innerHTML.includes('<img src=x'));
vm.runInContext("products.splice(products.findIndex(product => product.id === 'cream'), 1); categories.push('Audit & test'); renderAboutPage();", context);
assert.ok(vm.runInContext("categoryCarousel().includes('Audit &amp; test')", context));
for (const match of fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8').matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
  assert.ok(fs.existsSync(path.resolve(root, 'assets/css', match[1])), `Missing CSS image: ${match[1]}`);
}
console.log(`Frontend startup, category cards, routes, product pages and ${imageChecks} image references: OK`);
