<?php
function storefrontSession()
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_set_cookie_params(array(
            'httponly' => true,
            'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'samesite' => 'Lax',
        ));
        session_start();
    }
    if (empty($_SESSION['csrf_token'])) $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function storefrontAccess()
{
    storefrontSession();
    $password = getenv('LEBROSTONE_STORE_PASSWORD');
    $unlocked = !$password || !empty($_SESSION['lebrostone_store_unlocked']);
    $error = false;
    $page = isset($_GET['access']) && $_GET['access'] === 'password' ? 'password' : 'welcome';
    if (!$unlocked && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $submitted = $_POST['store_password'] ?? '';
        if (is_string($submitted) && hash_equals($password, $submitted)) {
            session_regenerate_id(true);
            $_SESSION['lebrostone_store_unlocked'] = true;
            $unlocked = true;
        } else {
            $error = true;
            $page = 'password';
        }
    }
    return array('store_unlocked' => $unlocked, 'password_error' => $error, 'gate_page' => $page);
}
