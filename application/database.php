<?php
// Defaults match local XAMPP. Set environment variables for other installations.
function storefrontDatabase($selectDatabase = true)
{
    $name = getenv('LEBROSTONE_DB_NAME') ?: 'lebrostone';
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $name)) {
        throw new RuntimeException('Invalid database name.');
    }
    $dsn = 'mysql:host=' . (getenv('LEBROSTONE_DB_HOST') ?: '127.0.0.1')
        . ';port=' . (getenv('LEBROSTONE_DB_PORT') ?: '3306')
        . ($selectDatabase ? ';dbname=' . $name : '') . ';charset=utf8mb4';
    return new PDO($dsn, getenv('LEBROSTONE_DB_USER') ?: 'root', getenv('LEBROSTONE_DB_PASSWORD') ?: '', array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
    ));
}

function storefrontCatalogue(PDO $db, $includeArchived = false)
{
    $rows = $db->query('SELECT p.*, c.name AS category FROM products p JOIN categories c ON c.id = p.category_id'
        . ($includeArchived ? '' : ' WHERE p.active = 1') . ' ORDER BY p.sort_order, p.id')->fetchAll();
    $products = array();
    foreach ($rows as $row) {
        $metadata = json_decode($row['metadata'], true);
        if (!is_array($metadata)) throw new RuntimeException('Invalid product metadata.');
        if (!$includeArchived) {
            foreach (($metadata['variants'] ?? array()) as $index => $pack) {
                $metadata['variants'][$index]['inStock'] = !empty($pack['inStock']) && ($pack['stockQty'] === null || $pack['stockQty'] > 0);
            }
        }
        $products[] = array_merge($metadata, array(
            'id' => $row['id'], 'name' => $row['name'], 'category' => $row['category'],
            'price' => $row['price'] === null ? null : (float) $row['price'], 'mrp' => (float) $row['mrp'],
            'inStock' => (bool) $row['in_stock'] && ($includeArchived || $row['stock_qty'] === null || $row['stock_qty'] > 0),
            'stockQty' => $row['stock_qty'] === null ? null : (int) $row['stock_qty'],
            'image' => $row['image'],
        ));
        if ($includeArchived) {
            $products[count($products) - 1]['active'] = (bool) $row['active'];
            $products[count($products) - 1]['revision'] = storefrontProductRevision($row);
        }
    }
    return $products;
}

function storefrontProductRevision($row)
{
    $fields = array();
    foreach (array('id', 'category_id', 'name', 'price', 'mrp', 'in_stock', 'stock_qty', 'image', 'metadata', 'active') as $field) $fields[] = $row[$field];
    return hash('sha256', json_encode($fields));
}
