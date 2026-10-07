<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('session.save_path', sys_get_temp_dir());
require_once __DIR__ . '/../application/database.php';
$snapshot = json_decode(file_get_contents(__DIR__ . '/../database/catalogue.json'), true);
$db = storefrontDatabase();
$catalogue = storefrontCatalogue($db);
if ($catalogue != $snapshot) throw new RuntimeException('Imported catalogue differs from the original snapshot.');
$store_unlocked = true;
ob_start();
require __DIR__ . '/../application/views/storefront.php';
$html = ob_get_clean();
if (!preg_match('/window\.LEBROSTONE_CATALOGUE = (.*?);<\/script>/s', $html, $match)
    || json_decode($match[1], true) != $snapshot
    || strpos($html, 'catalogue.js?v=') !== false) {
    throw new RuntimeException('Storefront did not render the database catalogue.');
}
foreach ($catalogue as $product) {
    if (!is_file(__DIR__ . '/../assets/images/' . $product['image'])) {
        throw new RuntimeException('Missing product image: ' . $product['image']);
    }
}
$document = new DOMDocument();
@$document->loadHTML($html);
foreach (array('script' => 'src', 'link' => 'href', 'img' => 'src') as $tag => $attribute) {
    foreach ($document->getElementsByTagName($tag) as $element) {
        $url = $element->getAttribute($attribute);
        if (strpos($url, 'assets/') !== 0) continue;
        $file = strtok($url, '?');
        if (!is_file(__DIR__ . '/../' . $file)) throw new RuntimeException('Missing page asset: ' . $file);
    }
}
echo count($catalogue) . ' products, ' . $db->query('SELECT COUNT(*) FROM categories')->fetchColumn()
    . " categories; catalogue round-trip and rendered page: OK\n";
