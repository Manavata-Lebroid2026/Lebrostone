<?php
require_once __DIR__ . '/application/session.php';
extract(storefrontAccess(), EXTR_SKIP);
$asset_base = 'assets/';
$gate_home = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
require __DIR__ . '/application/views/storefront.php';
