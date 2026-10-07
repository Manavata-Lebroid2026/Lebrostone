// Run with node tests/verify-bag.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const handler = source.slice(source.indexOf("window.addEventListener('click'"), source.indexOf('\nupdateCounts();'));
let onClick;
let open = true;
const drawer = { classList: { contains: () => open } };
vm.runInNewContext(handler, {
  window: { addEventListener: (type, listener) => { onClick = listener; } },
  cartDrawer: drawer,
  closeCart: () => { open = false; },
});
// A re-render detaches the original remove/minus target from the drawer.
const detachedTarget = { closest: () => null };
for (const action of ['remove', 'decrease', 'increase', 'remove last item']) {
  open = true;
  onClick({ target: detachedTarget, composedPath: () => [detachedTarget, drawer, {}] });
  assert.equal(open, true, `${action} must keep the bag open`);
}
onClick({ composedPath: () => [{ matches: selector => selector === '.cart-button' }, {}] });
assert.equal(open, true, 'Clicking the bag button must keep it open');
onClick({ composedPath: () => [{ matches: selector => selector === '[data-add]' }, {}] });
assert.equal(open, true, 'Adding a product must keep the newly opened bag open');
onClick({ composedPath: () => [{ matches: () => false }, {}] });
assert.equal(open, false, 'Clicking outside must close the bag');
console.log('Bag edits stay open; outside clicks still close: OK');
