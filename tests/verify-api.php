<?php
// Starts an isolated local PHP server and disposable database. No live shop data is changed.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../application/database.php';
function apiCheck($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$previousName = getenv('LEBROSTONE_DB_NAME'); $previousGate = getenv('LEBROSTONE_STORE_PASSWORD');
$testName = 'lebrostone_http_test_' . bin2hex(random_bytes(6));
putenv('LEBROSTONE_DB_NAME=' . $testName); putenv('LEBROSTONE_STORE_PASSWORD');
$serverDb = storefrontDatabase(false); $process = null; $temporaryFiles = array(); $uploadedFile = null;
try {
    ob_start(); require __DIR__ . '/../database/setup.php'; ob_end_clean();
    $testDb = storefrontDatabase();
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    apiCheck((bool) $socket, 'Unable to allocate a test port.');
    $address = stream_socket_get_name($socket, false); fclose($socket);
    $log = tempnam(sys_get_temp_dir(), 'lb_http_'); $temporaryFiles[] = $log;
    $aliceCookie = tempnam(sys_get_temp_dir(), 'lb_cookie_'); $temporaryFiles[] = $aliceCookie;
    $bobCookie = tempnam(sys_get_temp_dir(), 'lb_cookie_'); $temporaryFiles[] = $bobCookie;
    $command = escapeshellarg(PHP_BINARY) . ' -d ' . escapeshellarg('session.save_path=' . sys_get_temp_dir())
        . ' -d ' . escapeshellarg('upload_tmp_dir=' . sys_get_temp_dir())
        . ' -S ' . escapeshellarg($address) . ' -t ' . escapeshellarg(dirname(__DIR__));
    $process = proc_open($command, array(0 => array('pipe', 'r'), 1 => array('file', $log, 'a'), 2 => array('file', $log, 'a')), $pipes, dirname(__DIR__), null, array('bypass_shell' => true));
    apiCheck(is_resource($process), 'Unable to start isolated API server.'); fclose($pipes[0]);
    $base = 'http://' . $address;
    $request = function($action, $method = 'GET', $body = null, $csrf = '', $cookie = null) use ($base, $aliceCookie) {
        $curl = curl_init($base . '/api.php?action=' . rawurlencode($action));
        $headers = array('Accept: application/json', 'X-CSRF-Token: ' . $csrf);
        $options = array(CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_TIMEOUT => 5,
            CURLOPT_COOKIEFILE => $cookie ?: $aliceCookie, CURLOPT_COOKIEJAR => $cookie ?: $aliceCookie, CURLOPT_PROXY => '');
        if ($body !== null) {
            if (isset($body['photo']) && $body['photo'] instanceof CURLFile) $options[CURLOPT_POSTFIELDS] = $body;
            else { $headers[] = 'Content-Type: application/json'; $options[CURLOPT_POSTFIELDS] = json_encode($body); }
        }
        $options[CURLOPT_HTTPHEADER] = $headers; curl_setopt_array($curl, $options);
        $text = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
        return array($status, json_decode($text ?: '{}', true));
    };
    for ($attempt = 0; $attempt < 30; $attempt++) {
        list($status, $response) = $request('session'); if ($status === 200) break; usleep(100000);
    }
    apiCheck($status === 200, 'API server failed to start: ' . file_get_contents($log));
    $csrf = $response['data']['csrf'];
    apiCheck($request('admin/summary')[0] === 401, 'Unauthenticated admin access allowed.');
    apiCheck($request('register', 'POST', array('email' => 'a@example.test'), 'wrong')[0] === 403, 'CSRF check failed.');
    list($status, $response) = $request('register', 'POST', array('name' => 'HTTP Customer', 'email' => 'alice@example.test', 'password' => 'Api-test-password-123', 'role' => 'admin'), $csrf);
    apiCheck($status === 200 && $response['data']['user']['role'] === 'customer', 'Registration or role protection failed.');
    $aliceId = $response['data']['user']['id']; $csrf = $response['data']['csrf'];
    apiCheck($request('admin/products')[0] === 403, 'Customer accessed admin products.');
    list($status, $response) = $request('preferences', 'PUT', array('cart' => array('cream' => 2), 'wishlist' => array('cream')), $csrf);
    apiCheck($status === 200 && $response['data']['cart']['cream'] === 2, 'Saved cart API failed.');
    apiCheck($request('orders', 'POST', array('cart' => array('cream' => 2)), $csrf)[0] === 422, 'Incomplete checkout accepted.');
    $checkout = array('cart' => array('cream' => 2), 'coupon' => 'LEBROSTONE10', 'request_key' => 'http-order-request-123456', 'accept_terms' => true,
        'address' => array('name' => 'HTTP Customer', 'phone' => '9876543210', 'line1' => '123 Test Street', 'line2' => '', 'city' => 'Indore', 'state' => 'Madhya Pradesh', 'pincode' => '452016'));
    list($status, $response) = $request('orders', 'POST', $checkout, $csrf);
    apiCheck($status === 200 && $response['data']['total_paise'] === 32400 && $response['data']['payment_method'] === null, 'Order API or server totals failed.');
    $order = $response['data'];
    list($status, $response) = $request('orders', 'POST', $checkout, $csrf);
    apiCheck($status === 200 && $response['data']['id'] === $order['id'], 'HTTP retry duplicated order.');
    list($status, $response) = $request('session', 'GET', null, '', $bobCookie); $bobCsrf = $response['data']['csrf'];
    list($status, $response) = $request('register', 'POST', array('name' => 'Other HTTP Customer', 'email' => 'bob@example.test', 'password' => 'Api-other-password-123'), $bobCsrf, $bobCookie);
    apiCheck($status === 200, 'Second account failed.'); $bobCsrf = $response['data']['csrf']; $bobId = $response['data']['user']['id'];
    apiCheck($request('orders/' . $order['order_number'], 'GET', null, '', $bobCookie)[0] === 404, 'Another customer accessed the order.');
    apiCheck($request('orders/' . $order['order_number'], 'PUT', array('status' => 'cancelled'), $bobCsrf, $bobCookie)[0] === 404, 'Another customer cancelled the order.');
    $testDb->exec("UPDATE users SET role = 'admin' WHERE id = " . (int) $aliceId);
    apiCheck($request('admin/summary')[0] === 200, 'Admin session authorization failed.');
    list($status, $response) = $request('admin/upload', 'POST', array('photo' => new CURLFile(__DIR__ . '/../assets/images/logo.png', 'image/png', 'photo.png')), $csrf);
    apiCheck($status === 200 && preg_match('~^uploads/[a-f0-9]{32}\.png$~', $response['data']['image'] ?? ''), 'Photo upload failed: ' . json_encode($response));
    $uploadedFile = realpath(__DIR__ . '/../assets/images/' . $response['data']['image']);
    $product = array('name' => 'API Test Product', 'category' => 'Test Products', 'price' => 10, 'mrp' => 12, 'stockQty' => 2, 'size' => '50 g',
        'description' => 'Test product', 'badge' => '', 'highlight' => '', 'care' => '', 'image' => $response['data']['image'], 'variants' => array(), 'active' => true, 'inStock' => true);
    list($status, $response) = $request('admin/products', 'POST', $product, $csrf);
    apiCheck($status === 200, 'Admin product creation failed.');
    apiCheck($request('admin/orders/' . $order['order_number'], 'PUT', array('status' => 'confirmed'), $csrf)[0] === 200, 'Admin order confirmation failed.');
    apiCheck($request('admin/customers/' . $bobId, 'PUT', array('active' => false), $csrf)[0] === 200, 'Customer disable failed.');
    apiCheck($request('orders', 'GET', null, '', $bobCookie)[0] === 401, 'Disabled account retained access.');
    apiCheck($request('admin/customers/' . $bobId, 'PUT', array('active' => true), $csrf)[0] === 200, 'Customer re-enable failed.');
    apiCheck($request('orders', 'GET', null, '', $bobCookie)[0] === 401, 'Re-enabling revived an invalidated session.');
    apiCheck($request('logout', 'POST', array(), $csrf)[0] === 200, 'Logout failed.');
    apiCheck($request('orders')[0] === 401, 'Logout left account accessible.');
    echo "HTTP API: CSRF, accounts, permissions, cart persistence, checkout, duplicate prevention, uploads, admin and logout: OK\n";
} finally {
    if (is_resource($process)) { proc_terminate($process); proc_close($process); }
    if ($uploadedFile) {
        $uploadRoot = str_replace('\\', '/', realpath(__DIR__ . '/../assets/images/uploads')) . '/';
        apiCheck(strpos(str_replace('\\', '/', $uploadedFile), $uploadRoot) === 0, 'Invalid upload cleanup target.');
        unlink($uploadedFile);
    }
    foreach ($temporaryFiles as $file) if (is_file($file)) unlink($file);
    apiCheck((bool) preg_match('/^lebrostone_http_test_[a-f0-9]{12}$/', $testName), 'Invalid test database cleanup target.');
    $testDb = null; $serverDb->exec('DROP DATABASE `' . $testName . '`');
    putenv($previousName === false ? 'LEBROSTONE_DB_NAME' : 'LEBROSTONE_DB_NAME=' . $previousName);
    putenv($previousGate === false ? 'LEBROSTONE_STORE_PASSWORD' : 'LEBROSTONE_STORE_PASSWORD=' . $previousGate);
}
