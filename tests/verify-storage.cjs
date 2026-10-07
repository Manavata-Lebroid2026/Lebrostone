// Run with node tests/verify-storage.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const storageCode = source.slice(source.indexOf('const state ='), source.indexOf('function money('));
const productCode = source.slice(source.indexOf('function getProduct('), source.indexOf('function escapeHtml('));
const cartCode = source.slice(source.indexOf('function getCartItems('), source.indexOf('function updateCounts('));
const addCode = source.slice(source.indexOf('function addToCart('), source.indexOf('function renderCart('));

function boot(cart, wishlist, blocked = false, stockQty = null) {
  const saved = { 'lebrostone-cart': cart, 'lebrostone-wishlist': wishlist };
  const context = vm.createContext({
    products: [{ id: 'cream', price: 100, inStock: true, stockQty, variants: [
      { id: 'cream-large', price: 150, inStock: true, stockQty: null },
    ] }],
    localStorage: {
      getItem(key) { if (blocked) throw Error('Storage denied'); return saved[key] ?? null; },
      setItem(key, value) { if (blocked) throw Error('Storage denied'); saved[key] = value; },
    },
    showToast() {}, updateCounts() {}, renderCart() {},
  });
  vm.runInContext(storageCode + productCode + cartCode + addCode, context);
  return {
    read(expression) { return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context)); },
    run(code) { vm.runInContext(code, context); },
    saved,
  };
}

for (const invalid of [undefined, 'null', '{}', '[]', 'true', '42', '"cream"', '{broken']) {
  const app = boot(invalid, invalid);
  assert.deepEqual(app.read('state.cart'), {});
  assert.deepEqual(app.read('[...state.wishlist]'), []);
  app.run("addToCart('cream'); addToCart('cream');");
  assert.equal(app.read('getCartItems()[0].qty'), 2);
}

for (const qty of ['2', 'abc', 0, -1, 1.5, true, null, {}, [], 1e100]) {
  const app = boot(JSON.stringify({ cream: qty }), '{}');
  app.run("addToCart('cream');");
  assert.equal(app.read('getCartItems()[0].qty'), 1);
}

const mixed = boot('{"cream":2,"cream-large":3,"unknown":4,"__proto__":1}',
  '["cream",null,{},42,"unknown","cream","cream-large"]');
assert.deepEqual(mixed.read('state.cart'), { cream: 2, 'cream-large': 3 });
assert.deepEqual(mixed.read('[...state.wishlist]'), ['cream', 'cream-large']);
mixed.run("addToCart('cream'); updateQty('cream-large', -1);");
const reloaded = boot(mixed.saved['lebrostone-cart'], mixed.saved['lebrostone-wishlist']);
assert.deepEqual(reloaded.read('state.cart'), { cream: 3, 'cream-large': 2 });
assert.deepEqual(reloaded.read('[...state.wishlist]'), ['cream', 'cream-large']);

const blocked = boot(null, null, true);
blocked.run("addToCart('cream');");
assert.equal(blocked.read('getCartItems()[0].qty'), 1);
const limited = boot('{"cream":8}', '[]', false, 3);
assert.equal(limited.read('getCartItems()[0].qty'), 3);
limited.run("addToCart('cream'); updateQty('cream', 1);");
assert.equal(limited.read('getCartItems()[0].qty'), 3);
const exhausted = boot('{"cream":8}', '[]', false, 0);
assert.deepEqual(exhausted.read('state.cart'), {});
const maximum = boot(JSON.stringify({ cream: Number.MAX_SAFE_INTEGER }), '[]');
maximum.run("addToCart('cream'); updateQty('cream', 1);");
assert.equal(maximum.read('getCartItems()[0].qty'), 99);
maximum.run('delete products[0].variants;');
assert.equal(maximum.read("Boolean(getProduct('missing'))"), false);
console.log('Storage validation, stock limits, cart additions, variants, reload and denied storage: OK');
