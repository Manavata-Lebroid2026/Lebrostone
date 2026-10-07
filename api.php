<?php
require_once __DIR__ . '/application/commerce.php';
storefrontSession();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    if (getenv('LEBROSTONE_STORE_PASSWORD') && empty($_SESSION['lebrostone_store_unlocked'])) throw new CommerceError('Unlock the store first.', 403);
    $method = $_SERVER['REQUEST_METHOD']; $action = $_GET['action'] ?? 'session';
    if (!is_string($action)) throw new CommerceError('Invalid request.', 400);
    if ($method !== 'GET') {
        $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($csrf) || !hash_equals($_SESSION['csrf_token'], $csrf)) throw new CommerceError('Your session changed. Reload the page and try again.', 403);
    }
    $data = array();
    if ($method !== 'GET' && $action !== 'admin/upload') {
        if (($_SERVER['CONTENT_LENGTH'] ?? 0) > 100000) throw new CommerceError('Request too large.', 413);
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) throw new CommerceError('Invalid JSON request.', 400);
    }
    $db = storefrontDatabase(); $commerce = new Commerce($db); $result = null;
    if ($method === 'GET' && $action === 'session') $result = $commerce->session();
    elseif ($method === 'GET' && $action === 'catalogue') $result = storefrontCatalogue($db);
    elseif ($method === 'POST' && $action === 'register') $result = $commerce->register($data);
    elseif ($method === 'POST' && $action === 'login') $result = $commerce->login($data);
    elseif ($method === 'POST' && $action === 'logout') $result = $commerce->logout();
    elseif ($method === 'PUT' && $action === 'profile') $result = $commerce->profile($data);
    elseif ($method === 'POST' && $action === 'password') $result = $commerce->changePassword($data);
    elseif ($method === 'PUT' && $action === 'preferences') $result = $commerce->preferences($data);
    elseif ($method === 'POST' && $action === 'checkout/quote') $result = $commerce->checkoutQuote($data);
    elseif ($method === 'POST' && $action === 'orders') $result = $commerce->createOrder($data);
    elseif ($method === 'GET' && $action === 'orders') $result = $commerce->orders($_GET['page'] ?? 1);
    elseif ($method === 'GET' && preg_match('~^orders/([A-Z0-9-]+)$~', $action, $match)) $result = $commerce->order($match[1]);
    elseif ($method === 'PUT' && preg_match('~^orders/([A-Z0-9-]+)$~', $action, $match)) $result = $commerce->orderStatus($match[1], $data);
    elseif ($method === 'GET' && $action === 'admin/summary') $result = $commerce->adminSummary();
    elseif ($method === 'GET' && $action === 'admin/products') $result = $commerce->adminProducts();
    elseif ($method === 'POST' && $action === 'admin/products') $result = $commerce->saveProduct(null, $data);
    elseif ($method === 'PUT' && preg_match('~^admin/products/([a-zA-Z0-9-]+)$~', $action, $match)) $result = $commerce->saveProduct($match[1], $data);
    elseif ($method === 'POST' && $action === 'admin/upload') $result = $commerce->upload($_FILES['photo'] ?? null);
    elseif ($method === 'GET' && $action === 'admin/orders') $result = $commerce->orders($_GET['page'] ?? 1, true);
    elseif ($method === 'PUT' && preg_match('~^admin/orders/([A-Z0-9-]+)$~', $action, $match)) $result = $commerce->orderStatus($match[1], $data, true);
    elseif ($method === 'GET' && $action === 'admin/customers') $result = $commerce->customers($_GET['page'] ?? 1);
    elseif ($method === 'PUT' && preg_match('~^admin/customers/([0-9]+)$~', $action, $match)) $result = $commerce->customerStatus($match[1], $data);
    else throw new CommerceError('Endpoint not found.', 404);
    echo json_encode(array('data' => $result), JSON_THROW_ON_ERROR);
} catch (CommerceError $error) {
    http_response_code($error->status); echo json_encode(array('error' => $error->getMessage()));
} catch (Throwable $error) {
    error_log('Commerce error: ' . $error->getMessage()); http_response_code(500);
    echo json_encode(array('error' => 'The request could not be completed. Please try again.'));
}
