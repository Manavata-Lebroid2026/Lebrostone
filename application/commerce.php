<?php
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/session.php';

class CommerceError extends RuntimeException
{
    public $status;
    public function __construct($message, $status = 422) { parent::__construct($message); $this->status = $status; }
}

class Commerce
{
    private $db;
    public function __construct(PDO $db) { $this->db = $db; }
    private function query($sql, $params = array()) {
        $stmt = $this->db->prepare($sql); $stmt->execute($params); return $stmt;
    }
    private function text($data, $key, $min = 1, $max = 255) {
        $value = $data[$key] ?? '';
        if (!is_string($value)) throw new CommerceError('Please check the ' . $key . ' field.');
        $value = trim($value);
        if (mb_strlen($value) < $min || mb_strlen($value) > $max) throw new CommerceError('Please check the ' . $key . ' field.');
        return $value;
    }
    private function password($data, $key = 'password') {
        $value = $data[$key] ?? '';
        if (!is_string($value) || strlen($value) < 8 || strlen($value) > 72) throw new CommerceError('Use a password between 8 and 72 bytes.');
        return $value;
    }
    private function email($data) {
        $email = strtolower($this->text($data, 'email', 3, 191));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new CommerceError('Enter a valid email address.');
        return $email;
    }
    public function user($required = true, $admin = false) {
        $id = $_SESSION['user_id'] ?? 0;
        $user = $id ? $this->query('SELECT * FROM users WHERE id = ? AND active = 1', array($id))->fetch() : false;
        if ($user && (int) $user['session_version'] !== (int) ($_SESSION['auth_version'] ?? 0)) $user = false;
        if (!$user && $required) throw new CommerceError('Please sign in to continue.', 401);
        if ($admin && (!$user || $user['role'] !== 'admin')) throw new CommerceError('Administrator access is required.', 403);
        return $user ?: null;
    }
    private function publicUser($user) {
        if (!$user) return null;
        return array('id' => (int) $user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role'],
            'phone' => $user['phone'], 'address' => json_decode($user['address_data'] ?: 'null', true));
    }
    public function session() {
        $user = $this->user(false);
        return array('user' => $this->publicUser($user), 'csrf' => $_SESSION['csrf_token'],
            'cart' => (object) ($user ? $this->cart(json_decode($user['cart_data'] ?: '{}', true)) : array()),
            'wishlist' => $user ? $this->wishlist(json_decode($user['wishlist_data'] ?: '[]', true)) : array());
    }
    private function throttle($email) {
        $key = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'local') . '|' . $email);
        $count = $this->query('SELECT COUNT(*) FROM login_attempts WHERE attempt_key = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)', array($key))->fetchColumn();
        if ($count >= 10) throw new CommerceError('Too many attempts. Please try again in 15 minutes.', 429);
        $this->query('INSERT INTO login_attempts (attempt_key) VALUES (?)', array($key));
        $this->query('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        return $key;
    }
    public function register($data) {
        $email = $this->email($data); $name = $this->text($data, 'name', 2, 100); $password = $this->password($data);
        $this->throttle($email);
        try {
            $this->query('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', array($name, $email, password_hash($password, PASSWORD_DEFAULT)));
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') throw new CommerceError('An account already uses that email. Please sign in.', 409);
            throw $error;
        }
        session_regenerate_id(true); $_SESSION['user_id'] = (int) $this->db->lastInsertId();
        $_SESSION['auth_version'] = 1;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        return $this->session();
    }
    public function login($data) {
        $email = $this->email($data); $key = $this->throttle($email);
        $password = $data['password'] ?? '';
        $user = $this->query('SELECT * FROM users WHERE email = ?', array($email))->fetch();
        if (!is_string($password) || !$user || !$user['active'] || !password_verify($password, $user['password_hash'])) {
            throw new CommerceError('Email or password is incorrect.', 401);
        }
        $this->query('DELETE FROM login_attempts WHERE attempt_key = ?', array($key));
        session_regenerate_id(true); $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['auth_version'] = (int) $user['session_version'];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        return $this->session();
    }
    public function logout() {
        unset($_SESSION['user_id'], $_SESSION['auth_version']); session_regenerate_id(true); $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        return $this->session();
    }
    public function profile($data) {
        $user = $this->user(); $name = $this->text($data, 'name', 2, 100);
        $phone = $this->text($data, 'phone', 0, 20);
        $address = isset($data['address']) ? $this->address($data['address']) : null;
        $this->query('UPDATE users SET name = ?, phone = ?, address_data = ? WHERE id = ?', array($name, $phone, json_encode($address), $user['id']));
        return $this->session();
    }
    public function changePassword($data) {
        $user = $this->user(); $current = $data['current_password'] ?? '';
        if (!is_string($current) || !password_verify($current, $user['password_hash'])) throw new CommerceError('Current password is incorrect.');
        $hash = password_hash($this->password($data, 'new_password'), PASSWORD_DEFAULT);
        $this->query('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', array($hash, $user['id']));
        $_SESSION['auth_version'] = (int) $user['session_version'] + 1;
        session_regenerate_id(true); $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        return array('message' => 'Password changed.', 'csrf' => $_SESSION['csrf_token']);
    }
    private function lookup($catalogue) {
        $map = array();
        foreach ($catalogue as $product) {
            $map[$product['id']] = array('parent' => $product, 'pack' => $product, 'sku' => $product['id']);
            foreach (($product['variants'] ?? array()) as $variant) {
                $isBase = ($product['sourceVariantId'] ?? null) === $variant['id'];
                $map[$variant['id']] = array('parent' => $product, 'pack' => $isBase ? $product : array_merge($product, $variant),
                    'sku' => $isBase ? $product['id'] : $variant['id']);
            }
        }
        return $map;
    }
    private function cart($value) {
        if (!is_array($value)) return array();
        $map = $this->lookup(storefrontCatalogue($this->db)); $cart = array();
        foreach (array_slice($value, 0, 100, true) as $id => $qty) {
            if (!isset($map[$id]) || !is_int($qty) || $qty <= 0) continue;
            $pack = $map[$id]['pack'];
            if (!$pack['inStock'] || !($pack['price'] > 0)) continue;
            $qty = min($qty, 99, $pack['stockQty'] === null ? 99 : $pack['stockQty']);
            if ($qty > 0) $cart[$map[$id]['sku']] = max($cart[$map[$id]['sku']] ?? 0, $qty);
        }
        return $cart;
    }
    private function wishlist($value) {
        if (!is_array($value)) return array();
        $map = $this->lookup(storefrontCatalogue($this->db)); $ids = array();
        foreach (array_slice($value, 0, 200) as $id) {
            if (is_string($id) && isset($map[$id])) $ids[$map[$id]['parent']['id']] = true;
        }
        return array_keys($ids);
    }
    public function preferences($data) {
        $user = $this->user(); $cart = $this->cart($data['cart'] ?? array()); $wishlist = $this->wishlist($data['wishlist'] ?? array());
        $this->query('UPDATE users SET cart_data = ?, wishlist_data = ? WHERE id = ?', array(json_encode((object) $cart), json_encode($wishlist), $user['id']));
        return array('cart' => (object) $cart, 'wishlist' => $wishlist);
    }
    private function address($data) {
        if (!is_array($data)) throw new CommerceError('Enter a delivery address.');
        $address = array();
        foreach (array('name' => 100, 'line1' => 200, 'city' => 100, 'state' => 100) as $field => $max) $address[$field] = $this->text($data, $field, 2, $max);
        $address['line2'] = $this->text($data, 'line2', 0, 200);
        $address['phone'] = $this->text($data, 'phone', 10, 20);
        $address['phone'] = preg_replace('/[\s()+-]/', '', $address['phone']);
        if (strlen($address['phone']) === 12 && substr($address['phone'], 0, 2) === '91') $address['phone'] = substr($address['phone'], 2);
        if (!preg_match('/^[6-9][0-9]{9}$/', $address['phone'])) throw new CommerceError('Enter a valid Indian mobile number.');
        $address['pincode'] = $this->text($data, 'pincode', 6, 6);
        if (!preg_match('/^[1-9][0-9]{5}$/', $address['pincode'])) throw new CommerceError('Enter a valid six-digit PIN code.');
        $address['country'] = 'India';
        return $address;
    }
    private function productFromRow($row) {
        $meta = json_decode($row['metadata'], true);
        return array_merge($meta, array('id' => $row['id'], 'name' => $row['name'], 'price' => (float) $row['price'],
            'inStock' => (bool) $row['in_stock'], 'stockQty' => $row['stock_qty'] === null ? null : (int) $row['stock_qty'], 'image' => $row['image']));
    }
    private function quote($data, $user, $lock = false) {
        $cart = $data['cart'] ?? null;
        if (!is_array($cart) || !$cart || count($cart) > 100) throw new CommerceError('Add products to your bag first.');
        $map = $this->lookup(storefrontCatalogue($this->db)); $canonical = array();
        foreach ($cart as $id => $qty) {
            if (!isset($map[$id]) || !is_int($qty) || $qty < 1 || $qty > 99) throw new CommerceError('A bag item is invalid or unavailable. Please review your bag.');
            $sku = $map[$id]['sku'];
            $canonical[$sku] = ($canonical[$sku] ?? 0) + $qty;
            if ($canonical[$sku] > 99) throw new CommerceError('The maximum quantity per pack is 99.');
        }
        // Lock parent rows in a stable order, including all variants sharing the row.
        $parents = array(); foreach ($canonical as $sku => $qty) $parents[$map[$sku]['parent']['id']] = true;
        ksort($parents); $fresh = array();
        foreach (array_keys($parents) as $id) {
            $row = $this->query('SELECT * FROM products WHERE id = ? AND active = 1' . ($lock ? ' FOR UPDATE' : ''), array($id))->fetch();
            if (!$row) throw new CommerceError('A product is no longer available. Please review your bag.');
            $fresh[] = $this->productFromRow($row);
        }
        $map = $this->lookup($fresh); $items = array(); $subtotal = 0;
        foreach ($canonical as $sku => $qty) {
            if (!isset($map[$sku])) throw new CommerceError('A pack is no longer available.');
            $entry = $map[$sku]; $pack = $entry['pack'];
            if (!$pack['inStock'] || !($pack['price'] > 0) || ($pack['stockQty'] !== null && $qty > $pack['stockQty'])) {
                throw new CommerceError($pack['name'] . ' has insufficient stock. Please update your bag.', 409);
            }
            $unit = (int) round($pack['price'] * 100); $subtotal += $unit * $qty;
            $items[] = array('product_id' => $entry['parent']['id'], 'sku' => $entry['sku'], 'name' => $pack['name'],
                'size' => $pack['size'] ?? '', 'image' => $pack['image'], 'quantity' => $qty,
                'unit_price_paise' => $unit, 'tracked_stock' => $pack['stockQty'] !== null);
        }
        $coupon = strtoupper($this->text($data, 'coupon', 0, 40)); $discount = 0;
        if ($coupon !== '') {
            if ($coupon !== 'LEBROSTONE10') throw new CommerceError('This coupon is not valid.');
            $previous = $this->query("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status <> 'cancelled'", array($user['id']))->fetchColumn();
            if ($previous > 0) throw new CommerceError('LEBROSTONE10 is available on your first order only.');
            $discount = (int) round($subtotal * 0.10);
        }
        return array('items' => $items, 'subtotal_paise' => $subtotal, 'discount_paise' => $discount,
            'shipping_paise' => 0, 'total_paise' => $subtotal - $discount, 'coupon' => $coupon);
    }
    public function checkoutQuote($data) { return $this->quote($data, $this->user()); }
    private function adjustStock($item, $delta) {
        if (!$item['tracked_stock']) return;
        $row = $this->query('SELECT * FROM products WHERE id = ? FOR UPDATE', array($item['product_id']))->fetch();
        $meta = json_decode($row['metadata'], true); $stock = $row['stock_qty']; $base = $item['sku'] === $row['id'];
        if ($base) {
            if ($stock !== null) $stock = max(0, (int) $stock + $delta);
        }
        foreach (($meta['variants'] ?? array()) as $index => $variant) {
            if ($variant['id'] === $item['sku'] || ($base && $variant['id'] === ($meta['sourceVariantId'] ?? null))) {
                if ($variant['stockQty'] !== null) $meta['variants'][$index]['stockQty'] = max(0, $variant['stockQty'] + $delta);
            }
        }
        $this->query('UPDATE products SET stock_qty = ?, metadata = ? WHERE id = ?', array($stock, json_encode($meta, JSON_UNESCAPED_UNICODE), $row['id']));
    }
    public function createOrder($data) {
        if (($data['accept_terms'] ?? null) !== true) throw new CommerceError('Please review the store terms before submitting.');
        $user = $this->user(); $address = $this->address($data['address'] ?? null);
        $key = $this->text($data, 'request_key', 16, 64);
        if (!preg_match('/^[a-zA-Z0-9-]+$/', $key)) throw new CommerceError('Invalid order request.');
        $hashCart = $data['cart'] ?? null;
        if (is_array($hashCart)) ksort($hashCart);
        $hash = hash('sha256', json_encode(array($hashCart, $address, strtoupper($this->text($data, 'coupon', 0, 40)))));
        $this->db->beginTransaction();
        try {
            $this->query('SELECT id FROM users WHERE id = ? FOR UPDATE', array($user['id']));
            $existing = $this->query('SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ?', array($user['id'], $key))->fetch();
            if ($existing) {
                if ($existing['request_hash'] !== $hash) throw new CommerceError('This order request has already been used.', 409);
                $this->db->commit(); return $this->order($existing['order_number']);
            }
            $quote = $this->quote($data, $user, true);
            $number = 'LB-' . gmdate('ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
            $this->query("INSERT INTO orders (order_number, user_id, idempotency_key, request_hash, subtotal_paise, discount_paise, shipping_paise, total_paise, coupon, address_data, payment_method, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'not_configured')",
                array($number, $user['id'], $key, $hash, $quote['subtotal_paise'], $quote['discount_paise'], 0, $quote['total_paise'], $quote['coupon'], json_encode($address)));
            $orderId = $this->db->lastInsertId();
            foreach ($quote['items'] as $item) {
                $this->query('INSERT INTO order_items (order_id, product_id, sku, product_name, size, image, quantity, unit_price_paise, tracked_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    array($orderId, $item['product_id'], $item['sku'], $item['name'], $item['size'], $item['image'], $item['quantity'], $item['unit_price_paise'], $item['tracked_stock'] ? 1 : 0));
                $this->adjustStock($item, -$item['quantity']);
            }
            $this->query("UPDATE users SET cart_data = '{}', address_data = ?, phone = ? WHERE id = ?", array(json_encode($address), $address['phone'], $user['id']));
            $this->query("INSERT INTO order_events (order_id, actor_id, status) VALUES (?, ?, 'pending')", array($orderId, $user['id']));
            $this->db->commit();
            return $this->order($number);
        } catch (Throwable $error) { if ($this->db->inTransaction()) $this->db->rollBack(); throw $error; }
    }
    private function orderData($row, $details = false) {
        foreach (array('id', 'user_id', 'subtotal_paise', 'discount_paise', 'shipping_paise', 'total_paise') as $field) $row[$field] = (int) $row[$field];
        $row['address'] = json_decode($row['address_data'], true); unset($row['address_data'], $row['request_hash'], $row['idempotency_key']);
        if ($details) {
            $row['items'] = $this->query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', array($row['id']))->fetchAll();
            foreach ($row['items'] as &$item) { $item['quantity'] = (int) $item['quantity']; $item['unit_price_paise'] = (int) $item['unit_price_paise']; }
            unset($item);
            $row['events'] = $this->query('SELECT status, created_at FROM order_events WHERE order_id = ? ORDER BY id', array($row['id']))->fetchAll();
        }
        return $row;
    }
    public function orders($page = 1, $admin = false) {
        $user = $this->user(true, $admin); $page = max(1, min(1000000, (int) $page)); $offset = ($page - 1) * 20;
        $where = $admin ? '' : ' WHERE o.user_id = ?'; $params = $admin ? array() : array($user['id']);
        $total = (int) $this->query('SELECT COUNT(*) FROM orders o' . $where, $params)->fetchColumn();
        $rows = $this->query('SELECT o.*, u.email AS customer_email FROM orders o JOIN users u ON u.id = o.user_id' . $where . ' ORDER BY o.id DESC LIMIT 20 OFFSET ' . $offset, $params)->fetchAll();
        return array('orders' => array_map(function($row) { return $this->orderData($row); }, $rows), 'page' => $page, 'pages' => max(1, (int) ceil($total / 20)), 'total' => $total);
    }
    public function order($number) {
        $user = $this->user(); $row = $this->query('SELECT * FROM orders WHERE order_number = ?', array($number))->fetch();
        if (!$row || ($user['role'] !== 'admin' && (int) $row['user_id'] !== (int) $user['id'])) throw new CommerceError('Order not found.', 404);
        return $this->orderData($row, true);
    }
    public function orderStatus($number, $data, $admin = false) {
        $user = $this->user(true, $admin); $status = $this->text($data, 'status', 1, 20);
        $flow = array('pending' => array('confirmed', 'cancelled'), 'confirmed' => array('packed', 'cancelled'),
            'packed' => array('shipped', 'cancelled'), 'shipped' => array('delivered'), 'delivered' => array(), 'cancelled' => array());
        $this->db->beginTransaction();
        try {
            $row = $this->query('SELECT * FROM orders WHERE order_number = ? FOR UPDATE', array($number))->fetch();
            if (!$row || (!$admin && (int) $row['user_id'] !== (int) $user['id'])) throw new CommerceError('Order not found.', 404);
            if (!$admin && ($status !== 'cancelled' || !in_array($row['status'], array('pending', 'confirmed', 'cancelled'), true))) throw new CommerceError('This order can no longer be cancelled.', 409);
            if ($row['status'] !== $status && !in_array($status, $flow[$row['status']] ?? array(), true)) throw new CommerceError('This status change is not allowed.', 409);
            if ($row['status'] !== $status) {
                if ($status === 'cancelled') {
                    $items = $this->query('SELECT * FROM order_items WHERE order_id = ? ORDER BY product_id, sku', array($row['id']))->fetchAll();
                    foreach ($items as $item) $this->adjustStock($item, (int) $item['quantity']);
                }
                $tracking = $this->text($data, 'tracking_number', 0, 100);
                if ($status === 'shipped' && $tracking === '') throw new CommerceError('Enter a tracking number before shipping.');
                $this->query('UPDATE orders SET status = ?, tracking_number = ? WHERE id = ?', array($status, $tracking ?: $row['tracking_number'], $row['id']));
                $this->query('INSERT INTO order_events (order_id, actor_id, status) VALUES (?, ?, ?)', array($row['id'], $user['id'], $status));
            }
            $this->db->commit(); return $this->order($number);
        } catch (Throwable $error) { if ($this->db->inTransaction()) $this->db->rollBack(); throw $error; }
    }
    public function adminSummary() {
        $this->user(true, true);
        return array('products' => (int) $this->query('SELECT COUNT(*) FROM products WHERE active = 1')->fetchColumn(),
            'customers' => (int) $this->query("SELECT COUNT(*) FROM users WHERE role = 'customer'")->fetchColumn(),
            'orders' => (int) $this->query('SELECT COUNT(*) FROM orders')->fetchColumn(),
            'pending' => (int) $this->query("SELECT COUNT(*) FROM orders WHERE status = 'pending'")->fetchColumn(),
            'order_value_paise' => (int) $this->query("SELECT COALESCE(SUM(total_paise), 0) FROM orders WHERE status <> 'cancelled'")->fetchColumn());
    }
    private function amount($data, $key, $allowNull = false) {
        $value = $data[$key] ?? null;
        if ($allowNull && ($value === null || $value === '')) return null;
        if ((!is_int($value) && !is_float($value) && !is_string($value)) || !is_numeric($value) || $value < 0 || $value > 9999999) throw new CommerceError('Enter a valid ' . $key . '.');
        return round((float) $value, 2);
    }
    private function stock($data) {
        $value = $data['stockQty'] ?? null;
        if ($value === null || $value === '') return null;
        if (filter_var($value, FILTER_VALIDATE_INT) === false || $value < 0 || $value > 10000000) throw new CommerceError('Stock must be a non-negative whole number.');
        return (int) $value;
    }
    public function saveProduct($id, $data) {
        $this->user(true, true); $existing = null;
        if ($id) {
            $existing = $this->query('SELECT * FROM products WHERE id = ?', array($id))->fetch();
            if (!$existing) throw new CommerceError('Product not found.', 404);
        } else $id = 'p-' . bin2hex(random_bytes(12));
        $name = $this->text($data, 'name', 2, 255); $category = $this->text($data, 'category', 2, 191);
        $image = $this->text($data, 'image', 1, 512);
        if (strpos($image, '..') !== false || !preg_match('/^[a-zA-Z0-9_\/.-]+\.(png|jpe?g|webp)$/i', $image) || !is_file(__DIR__ . '/../assets/images/' . $image)) throw new CommerceError('Select an existing product image or upload a photo.');
        $price = $this->amount($data, 'price'); $mrp = $this->amount($data, 'mrp'); $stock = $this->stock($data);
        if ($mrp > 0 && $mrp < $price) throw new CommerceError('MRP cannot be less than the selling price.');
        $meta = $existing ? json_decode($existing['metadata'], true) : array('sourceId' => $id, 'sourceUrl' => '', 'sourceVariantId' => null, 'concerns' => array());
        $meta['fullName'] = $name; $meta['size'] = $this->text($data, 'size', 1, 100);
        $meta['description'] = $this->text($data, 'description', 0, 5000); $meta['badge'] = $this->text($data, 'badge', 0, 60) ?: $category;
        $meta['details'] = array($this->text($data, 'highlight', 0, 500), $name, $this->text($data, 'care', 0, 1000));
        $variants = $data['variants'] ?? array();
        if (!is_array($variants) || count($variants) > 20) throw new CommerceError('Use at most 20 pack variants.');
        $oldVariants = array(); foreach (($meta['variants'] ?? array()) as $pack) $oldVariants[$pack['id']] = $pack;
        $meta['variants'] = array(); $seen = array();
        foreach ($variants as $pack) {
            if (!is_array($pack)) throw new CommerceError('Invalid pack variant.');
            $sku = $pack['id'] ?? '';
            if ($sku && !isset($oldVariants[$sku])) throw new CommerceError('Invalid existing variant.');
            if (!$sku) $sku = $id . '-' . bin2hex(random_bytes(8));
            if ($sku === ($meta['sourceVariantId'] ?? null)) continue;
            if (isset($seen[$sku])) throw new CommerceError('Each pack variant must appear only once.');
            $seen[$sku] = true;
            $packPrice = $this->amount($pack, 'price'); $packMrp = $this->amount($pack, 'mrp');
            if ($packMrp > 0 && $packMrp < $packPrice) throw new CommerceError('Variant MRP cannot be less than its selling price.');
            $meta['variants'][] = array('id' => $sku, 'size' => $this->text($pack, 'size', 1, 100), 'price' => $this->amount($pack, 'price'),
                'mrp' => $this->amount($pack, 'mrp'), 'stockQty' => $this->stock($pack), 'inStock' => !empty($pack['inStock']));
        }
        if (!empty($meta['sourceVariantId'])) $meta['variants'][] = array('id' => $meta['sourceVariantId'], 'size' => $meta['size'], 'price' => $price, 'mrp' => $mrp, 'stockQty' => $stock, 'inStock' => !empty($data['inStock']));
        $this->db->beginTransaction();
        try {
            $this->query('INSERT INTO categories (name) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)', array($category));
            $categoryId = $this->db->lastInsertId();
            if ($existing) {
                $locked = $this->query('SELECT * FROM products WHERE id = ? FOR UPDATE', array($id))->fetch();
                if (!is_string($data['revision'] ?? null) || !hash_equals(storefrontProductRevision($locked), $data['revision'])) {
                    throw new CommerceError('This product changed while you were editing it. Reload the product and try again.', 409);
                }
                $this->query('UPDATE products SET category_id = ?, name = ?, price = ?, mrp = ?, stock_qty = ?, in_stock = ?, image = ?, metadata = ?, active = ? WHERE id = ?',
                    array($categoryId, $name, $price, $mrp, $stock, !empty($data['inStock']) ? 1 : 0, $image, json_encode($meta), !empty($data['active']) ? 1 : 0, $id));
            } else {
                $this->query('INSERT INTO products (id, category_id, name, price, mrp, stock_qty, in_stock, image, metadata, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 9999, ?)',
                    array($id, $categoryId, $name, $price, $mrp, $stock, !empty($data['inStock']) ? 1 : 0, $image, json_encode($meta), !empty($data['active']) ? 1 : 0));
            }
            $this->db->commit(); return array('id' => $id);
        } catch (Throwable $error) { if ($this->db->inTransaction()) $this->db->rollBack(); throw $error; }
    }
    public function adminProducts() { $this->user(true, true); return storefrontCatalogue($this->db, true); }
    public function customers($page = 1) {
        $this->user(true, true); $page = max(1, min(1000000, (int) $page)); $offset = ($page - 1) * 20;
        $total = (int) $this->query("SELECT COUNT(*) FROM users WHERE role = 'customer'")->fetchColumn();
        return array('customers' => $this->query("SELECT u.id, u.name, u.email, u.phone, u.active, u.created_at, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders FROM users u WHERE u.role = 'customer' ORDER BY u.id DESC LIMIT 20 OFFSET " . $offset)->fetchAll(),
            'page' => $page, 'pages' => max(1, (int) ceil($total / 20)));
    }
    public function customerStatus($id, $data) {
        $this->user(true, true); $active = !empty($data['active']) ? 1 : 0;
        $user = $this->query("SELECT id FROM users WHERE id = ? AND role = 'customer'", array($id))->fetch();
        if (!$user) throw new CommerceError('Customer not found.', 404);
        $this->query('UPDATE users SET active = ?, session_version = session_version + 1 WHERE id = ?', array($active, $id));
        return array('message' => $active ? 'Customer enabled.' : 'Customer disabled.');
    }
    public function upload($file) {
        $this->user(true, true);
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'])) throw new CommerceError('Upload a photo smaller than 5 MB.');
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $formats = array('image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp');
        if (!isset($formats[$mime]) || !getimagesize($file['tmp_name'])) throw new CommerceError('Use a JPEG, PNG or WebP photo.');
        $directory = __DIR__ . '/../assets/images/uploads';
        if (!is_dir($directory)) mkdir($directory, 0755, true);
        $image = 'uploads/' . bin2hex(random_bytes(16)) . '.' . $formats[$mime];
        if (!move_uploaded_file($file['tmp_name'], __DIR__ . '/../assets/images/' . $image)) throw new CommerceError('The photo could not be saved.', 500);
        return array('image' => $image);
    }
}
