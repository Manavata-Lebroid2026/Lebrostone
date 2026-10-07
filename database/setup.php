<?php
// CLI only: php database/setup.php. Existing products are never overwritten.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../application/database.php';

try {
    $products = json_decode(file_get_contents(__DIR__ . '/catalogue.json'), true);
    if (!is_array($products) || !$products) throw new RuntimeException('Invalid catalogue snapshot.');
    $db = storefrontDatabase(false);
    $name = getenv('LEBROSTONE_DB_NAME') ?: 'lebrostone';
    $db->exec('CREATE DATABASE IF NOT EXISTS `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $db->exec('USE `' . $name . '`');
    $schema = file_get_contents(__DIR__ . '/schema.sql');
    foreach (explode(';', $schema) as $statement) {
        if (trim($statement) !== '') $db->exec($statement);
    }
    if (!$db->query("SHOW COLUMNS FROM products LIKE 'active'")->fetch()) {
        $db->exec('ALTER TABLE products ADD active TINYINT(1) NOT NULL DEFAULT 1');
    }
    foreach (explode(';', file_get_contents(__DIR__ . '/commerce.sql')) as $statement) {
        if (trim($statement) !== '') $db->exec($statement);
    }
    if (!$db->query("SHOW COLUMNS FROM users LIKE 'session_version'")->fetch()) {
        $db->exec('ALTER TABLE users ADD session_version INT UNSIGNED NOT NULL DEFAULT 1');
    }
    if ((int) $db->query('SELECT COUNT(*) FROM products')->fetchColumn() > 0) {
        echo "Database already has products; existing data preserved.\n";
        exit(0);
    }
    $db->beginTransaction();
    $categoryInsert = $db->prepare('INSERT INTO categories (name) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)');
    $productInsert = $db->prepare('INSERT INTO products (id, category_id, name, price, mrp, in_stock, stock_qty, image, metadata, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach ($products as $position => $product) {
        $categoryInsert->execute(array($product['category']));
        $categoryId = $db->lastInsertId();
        $metadata = $product;
        foreach (array('id', 'category', 'name', 'price', 'mrp', 'inStock', 'stockQty', 'image') as $field) unset($metadata[$field]);
        $metadataJson = json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($metadataJson === false) throw new RuntimeException('Cannot encode product metadata.');
        $productInsert->execute(array($product['id'], $categoryId, $product['name'], $product['price'], $product['mrp'],
            $product['inStock'] ? 1 : 0, $product['stockQty'], $product['image'], $metadataJson, $position));
    }
    $db->commit();
    echo 'Imported ' . count($products) . " products into MySQL.\n";
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    fwrite(STDERR, 'Database setup failed: ' . $error->getMessage() . "\n");
    exit(1);
}
