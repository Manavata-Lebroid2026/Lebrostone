<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../application/database.php';
$email = $argv[1] ?? '';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Usage: php database/promote-admin.php registered-email@example.com\nRegister an account on the site first.\n");
    exit(1);
}
$db = storefrontDatabase();
$update = $db->prepare("UPDATE users SET role = 'admin', active = 1 WHERE email = ?");
$update->execute(array(strtolower($email)));
$check = $db->prepare("SELECT id FROM users WHERE email = ? AND role = 'admin'");
$check->execute(array(strtolower($email)));
if (!$check->fetch()) { fwrite(STDERR, "Register this email on the site first.\n"); exit(1); }
echo "Administrator access enabled for the registered account.\n";
