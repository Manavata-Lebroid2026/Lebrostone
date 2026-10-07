<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('session.save_path', sys_get_temp_dir());
require_once __DIR__ . '/../application/commerce.php';
storefrontSession();
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
function rejects($callback, $status) {
    try { $callback(); } catch (CommerceError $error) { check($error->status === $status, $error->getMessage()); return; }
    throw new RuntimeException('Expected rejection did not occur.');
}
$previousName = getenv('LEBROSTONE_DB_NAME');
$testName = 'lebrostone_test_' . bin2hex(random_bytes(6));
putenv('LEBROSTONE_DB_NAME=' . $testName);
$server = storefrontDatabase(false);
try {
    ob_start(); require __DIR__ . '/../database/setup.php'; ob_end_clean();
    $db = storefrontDatabase(); $shop = new Commerce($db);
    rejects(function() use ($shop) { $shop->orders(); }, 401);
    $alice = $shop->register(array('name' => 'Test Customer', 'email' => 'alice@example.test', 'password' => 'Test-password-123'));
    check($alice['user']['role'] === 'customer', 'Registration granted incorrect role.');
    check(password_verify('Test-password-123', $db->query('SELECT password_hash FROM users LIMIT 1')->fetchColumn()), 'Password was not hashed.');
    $aliceId = $alice['user']['id'];
    rejects(function() use ($shop) { $shop->adminSummary(); }, 403);
    $cream = array_values(array_filter(storefrontCatalogue($db), function($p) { return $p['id'] === 'cream'; }))[0];
    $variant = $cream['variants'][0];
    $prefs = $shop->preferences(array('cart' => array($variant['id'] => 2, 'bogus' => 1, 'cream' => 'bad'), 'wishlist' => array('cream', 'bogus', $variant['id'])));
    check((array) $prefs['cart'] === array($variant['id'] => 2) && $prefs['wishlist'] === array('cream'), 'Preferences were not sanitized.');
    $address = array('name' => 'Test Customer', 'line1' => '123 Test Street', 'line2' => '', 'city' => 'Indore', 'state' => 'Madhya Pradesh', 'pincode' => '452016', 'phone' => '9876543210');
    $payload = array('cart' => array($variant['id'] => 2), 'address' => $address, 'coupon' => 'LEBROSTONE10', 'request_key' => 'test-request-123456789', 'accept_terms' => true, 'total_paise' => 1);
    $quote = $shop->checkoutQuote($payload);
    check($quote['total_paise'] === (int) round($variant['price'] * 2 * 100 * 0.9), 'Server total is incorrect.');
    $order = $shop->createOrder($payload);
    check($order['total_paise'] === $quote['total_paise'] && $order['payment_method'] === null && $order['payment_status'] === 'not_configured', 'Order totals or payment state are wrong.');
    $duplicate = $shop->createOrder($payload);
    check($duplicate['id'] === $order['id'] && $db->query('SELECT COUNT(*) FROM orders')->fetchColumn() == 1, 'Duplicate submission created another order.');
    $changedRequest = $payload; $changedRequest['address']['city'] = 'Bhopal';
    rejects(function() use ($shop, $changedRequest) { $shop->createOrder($changedRequest); }, 409);
    $stock = array_values(array_filter(storefrontCatalogue($db), function($p) { return $p['id'] === 'cream'; }))[0]['variants'][0]['stockQty'];
    check($stock === $variant['stockQty'] - 2, 'Variant stock was not decremented.');
    rejects(function() use ($shop, $payload) { $shop->checkoutQuote($payload); }, 422);
    $bad = $payload; $bad['request_key'] = 'test-request-overstock'; $bad['cart'][$variant['id']] = 100; $bad['coupon'] = '';
    rejects(function() use ($shop, $bad) { $shop->createOrder($bad); }, 422);
    check($db->query('SELECT COUNT(*) FROM orders')->fetchColumn() == 1, 'Failed order persisted.');
    $shop->logout();
    $bob = $shop->register(array('name' => 'Other Customer', 'email' => 'bob@example.test', 'password' => 'Other-password-123'));
    rejects(function() use ($shop, $order) { $shop->order($order['order_number']); }, 404);
    rejects(function() use ($shop, $order) { $shop->orderStatus($order['order_number'], array('status' => 'cancelled')); }, 404);
    $shop->logout();
    rejects(function() use ($shop) { $shop->login(array('email' => 'alice@example.test', 'password' => 'wrong')); }, 401);
    $shop->login(array('email' => 'alice@example.test', 'password' => 'Test-password-123'));
    check(isset(((array) $shop->session()['cart'])['cream']) === false, 'Order did not clear the saved cart.');
    $cancelled = $shop->orderStatus($order['order_number'], array('status' => 'cancelled'));
    check($cancelled['status'] === 'cancelled', 'Customer cancellation failed.');
    $stock = array_values(array_filter(storefrontCatalogue($db), function($p) { return $p['id'] === 'cream'; }))[0]['variants'][0]['stockQty'];
    check($stock === $variant['stockQty'], 'Cancellation did not restore stock.');
    $shop->orderStatus($order['order_number'], array('status' => 'cancelled'));
    $stockAgain = array_values(array_filter(storefrontCatalogue($db), function($p) { return $p['id'] === 'cream'; }))[0]['variants'][0]['stockQty'];
    check($stockAgain === $stock, 'Repeated cancellation restored stock twice.');
    $oldAuthVersion = $_SESSION['auth_version'];
    $shop->changePassword(array('current_password' => 'Test-password-123', 'new_password' => 'New-password-123'));
    $newAuthVersion = $_SESSION['auth_version']; $_SESSION['auth_version'] = $oldAuthVersion;
    rejects(function() use ($shop) { $shop->user(); }, 401);
    $_SESSION['auth_version'] = $newAuthVersion;
    $shop->logout(); $shop->login(array('email' => 'alice@example.test', 'password' => 'New-password-123'));
    $db->exec("UPDATE users SET role = 'admin' WHERE id = " . (int) $aliceId);
    $base = array_values(array_filter(storefrontCatalogue($db), function($p) { return !empty($p['sourceVariantId']) && $p['stockQty'] > 1 && $p['inStock']; }))[0];
    $baseOrderData = $payload; $baseOrderData['cart'] = array($base['sourceVariantId'] => 1); $baseOrderData['coupon'] = ''; $baseOrderData['request_key'] = 'source-pack-request-123';
    $baseOrder = $shop->createOrder($baseOrderData);
    $freshBase = array_values(array_filter(storefrontCatalogue($db), function($p) use ($base) { return $p['id'] === $base['id']; }))[0];
    check($freshBase['stockQty'] === $base['stockQty'] - 1 && $baseOrder['items'][0]['sku'] === $base['id'], 'Base variant alias bypassed stock tracking.');
    $mirror = array_values(array_filter($freshBase['variants'], function($v) use ($base) { return $v['id'] === $base['sourceVariantId']; }))[0];
    check($mirror['stockQty'] === $freshBase['stockQty'], 'Base variant stock is inconsistent.');
    $shop->orderStatus($baseOrder['order_number'], array('status' => 'confirmed'), true);
    $shop->orderStatus($baseOrder['order_number'], array('status' => 'packed'), true);
    rejects(function() use ($shop, $baseOrder) { $shop->orderStatus($baseOrder['order_number'], array('status' => 'shipped'), true); }, 422);
    $shop->orderStatus($baseOrder['order_number'], array('status' => 'shipped', 'tracking_number' => 'TEST-TRACKING'), true);
    $delivered = $shop->orderStatus($baseOrder['order_number'], array('status' => 'delivered'), true);
    check($delivered['status'] === 'delivered', 'Order fulfillment did not complete.');
    rejects(function() use ($shop, $baseOrder) { $shop->orderStatus($baseOrder['order_number'], array('status' => 'cancelled'), true); }, 409);
    $product = array('name' => 'Test product', 'category' => 'Test category', 'price' => '10.50', 'mrp' => '12', 'stockQty' => '3', 'image' => 'logo.png', 'size' => '50 g',
        'description' => 'Test description', 'highlight' => '', 'care' => '', 'badge' => '', 'inStock' => true, 'active' => true,
        'variants' => array(array('size' => '100 g', 'price' => 20, 'mrp' => 22, 'stockQty' => 5, 'inStock' => true)));
    $new = $shop->saveProduct(null, $product);
    $all = $shop->adminProducts(); $saved = array_values(array_filter($all, function($p) use ($new) { return $p['id'] === $new['id']; }))[0];
    $product['revision'] = $saved['revision']; $product['name'] = 'Updated product'; $product['variants'] = $saved['variants'];
    $shop->saveProduct($new['id'], $product);
    rejects(function() use ($shop, $new, $product) { $shop->saveProduct($new['id'], $product); }, 409);
    $product['revision'] = array_values(array_filter($shop->adminProducts(), function($p) use ($new) { return $p['id'] === $new['id']; }))[0]['revision'];
    $product['active'] = false; $shop->saveProduct($new['id'], $product);
    check(!array_filter(storefrontCatalogue($db), function($p) use ($new) { return $p['id'] === $new['id']; }), 'Archived product is still public.');
    $shop->customerStatus($bob['user']['id'], array('active' => false));
    check($shop->adminSummary()['orders'] === 2, 'Admin summary is wrong.');
    $shop->logout();
    rejects(function() use ($shop) { $shop->login(array('email' => 'bob@example.test', 'password' => 'Other-password-123')); }, 401);
    echo "Accounts, authorization, saved preferences, checkout totals, stock, duplicate orders, cancellation, password changes and admin editing: OK\n";
} finally {
    // This database was generated by this test; production data is never modified.
    if (!preg_match('/^lebrostone_test_[a-f0-9]{12}$/', $testName)) throw new RuntimeException('Invalid test cleanup target.');
    $db = null; $shop = null;
    $server->exec('DROP DATABASE `' . $testName . '`');
    putenv($previousName === false ? 'LEBROSTONE_DB_NAME' : 'LEBROSTONE_DB_NAME=' . $previousName);
}
