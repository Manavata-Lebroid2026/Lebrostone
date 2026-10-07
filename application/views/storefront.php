<?php
require_once __DIR__ . '/../session.php';
storefrontSession();
$asset_base = isset($asset_base) ? $asset_base : 'assets/';
$style_version = filemtime(__DIR__ . '/../../assets/css/style.css');
$script_version = filemtime(__DIR__ . '/../../assets/js/app.js');
$gate_home = isset($gate_home) ? $gate_home : './';
$store_unlocked = isset($store_unlocked) && $store_unlocked;
$gate_page = isset($gate_page) ? $gate_page : 'welcome';
$password_error = isset($password_error) && $password_error;
$api_url = isset($api_url) ? $api_url : 'api.php';
if ($store_unlocked) {
    require_once __DIR__ . '/../database.php';
    try {
        $catalogue_json = json_encode(storefrontCatalogue(storefrontDatabase()), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        error_log('Storefront database error: ' . $error->getMessage());
        http_response_code(503);
        echo 'The store is temporarily unavailable. Please try again shortly.';
        return;
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="Lebrostone wellness and skincare — premium Ayurvedic rituals for daily care.">
  <meta name="theme-color" content="#1f3c36">
  <title>Lebrostone — Ayurvedic Wellness & Skincare</title>
  <link rel="icon" href="<?= htmlspecialchars($asset_base) ?>images/logo.png">
  <link rel="stylesheet" href="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>css/bootstrap.min.css">
  <link rel="stylesheet" href="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>css/style.css?v=<?= $style_version ?>">
  <link rel="stylesheet" href="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>css/commerce.css?v=<?= filemtime(__DIR__ . '/../../assets/css/commerce.css') ?>">
  <?php if ($store_unlocked): ?>
    <script>window.LEBROSTONE_CATALOGUE = <?= $catalogue_json ?>;</script>
    <script>window.LEBROSTONE_COMMERCE = <?= json_encode(array('csrf' => $_SESSION['csrf_token'], 'endpoint' => $api_url), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
    <script defer src="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>js/blogs.js?v=<?= filemtime(__DIR__ . '/../../assets/js/blogs.js') ?>"></script>
    <script defer src="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>js/reviews.js?v=<?= filemtime(__DIR__ . '/../../assets/js/reviews.js') ?>"></script>
    <script defer src="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>js/policies.js?v=<?= filemtime(__DIR__ . '/../../assets/js/policies.js') ?>"></script>
    <script defer src="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>js/app.js?v=<?= $script_version ?>"></script>
    <script defer src="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>js/commerce.js?v=<?= filemtime(__DIR__ . '/../../assets/js/commerce.js') ?>"></script>
  <?php endif; ?>
</head>
<body class="<?= $store_unlocked ? 'storefront' : 'store-preview' ?>" data-assets="<?= htmlspecialchars($asset_base) ?>">
  <?php if (!$store_unlocked): ?>
    <div class="store-gate">
      <header class="gate-header">
        <a href="<?= htmlspecialchars($gate_home, ENT_QUOTES, 'UTF-8') ?>" class="gate-brand" aria-label="Lebrostone home">
          <img src="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>images/logo.png" alt="Lebrostone">
        </a>
        <?php if ($gate_page !== 'password'): ?>
          <a class="gate-password-link" href="?access=password">Enter using password <span aria-hidden="true">→</span></a>
        <?php endif; ?>
      </header>

      <?php if ($gate_page === 'password'): ?>
        <main class="gate-password-page">
          <a class="gate-close" href="<?= htmlspecialchars($gate_home, ENT_QUOTES, 'UTF-8') ?>" aria-label="Back to welcome page">×</a>
          <div class="gate-password-content">
            <p class="gate-eyebrow">Lebrostone private preview</p>
            <h1>Enter store using password</h1>
            <form class="gate-password-form" method="post" action="">
              <label class="visually-hidden" for="storePassword">Your password</label>
              <input id="storePassword" name="store_password" type="password" placeholder="Your password" autocomplete="current-password" required autofocus>
              <button type="submit">Enter <span aria-hidden="true">→</span></button>
            </form>
            <?php if ($password_error): ?>
              <p class="gate-error" role="alert">That password doesn’t match. Please try again.</p>
            <?php endif; ?>
          </div>
        </main>
      <?php else: ?>
        <main class="gate-welcome">
          <div class="gate-welcome-art" aria-hidden="true">
            <img src="<?= htmlspecialchars($asset_base, ENT_QUOTES, 'UTF-8') ?>images/hero-botanical.png" alt="">
          </div>
          <section class="gate-welcome-panel">
            <p class="gate-eyebrow">Rooted in everyday wellness</p>
            <h1>Opening soon</h1>
            <p>Be among the first to discover thoughtful Ayurvedic rituals for everyday care.</p>
            <a class="gate-enter-button" href="?access=password">Enter using password <span aria-hidden="true">→</span></a>
          </section>
        </main>
      <?php endif; ?>

      <footer class="gate-footer">
        <span>© <?= date('Y') ?> Lebrostone</span>
        <span>Ayurvedic wellness, made for everyday</span>
      </footer>
    </div>
  <?php else: ?>
  <div id="loader" class="loader-screen" aria-live="polite" aria-label="Loading Lebrostone">
    <div class="loader-card">
      <img src="<?= htmlspecialchars($asset_base) ?>images/logo.png" alt="Lebrostone logo" class="loader-logo" />
      <div class="loader-name">LEBROSTONE</div>
      <div class="loader-track"><span></span></div>
    </div>
  </div>

  <div id="announcementBar" class="topbar" role="region" aria-label="Store announcements" aria-live="polite" aria-atomic="true">
    <span id="announcementMessage">GET 10% OFF YOUR FIRST ORDER &mdash; LEBROSTONE10!</span>
  </div>

  <header class="site-header storefront-header">
    <div class="container header-inner">
      <button class="menu-button" aria-label="Toggle menu" aria-controls="mainNavigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>

      <div class="brand-wrap">
        <a href="#" class="brand" data-route="home" aria-label="Lebrostone home">
          <img src="<?= htmlspecialchars($asset_base) ?>images/logo.png" alt="Lebrostone" />
        </a>
      </div>

      <nav id="mainNavigation" class="main-nav" aria-label="Main navigation">
        <a href="#home" data-route="home">Home</a>
        <a href="#shop?category=Skin%20Care" data-route="shop" data-category="Skin Care">Skin Care</a>
        <a href="#shop?category=Hair%20Care" data-route="shop" data-category="Hair Care">Hair Care</a>
        <a href="#shop?category=Daily%20Wellness" data-route="shop" data-category="Daily Wellness">Daily Wellness</a>
        <a href="#shop?category=Balm" data-route="shop" data-category="Balm">Balm</a>
        <a href="#shop" data-route="shop" data-category="All">Shop All</a>
        <a href="#journal" data-route="journal">Blog</a>
        <details class="nav-dropdown">
          <summary>Reviews</summary>
          <div class="nav-dropdown-menu">
            <a href="#video-reviews" data-route="video-reviews">Video Reviews</a>
            <a href="#text-reviews" data-route="text-reviews">Text Reviews</a>
          </div>
        </details>
        <a href="#about" data-route="about">About Us</a>
      </nav>

      <div class="header-actions">
        <button class="header-icon account-button" data-route="account" aria-label="My account">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>
        </button>
        <button class="header-icon search-button" aria-label="Search products" aria-haspopup="dialog" aria-controls="searchDialog">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></svg>
        </button>
        <button class="header-icon wishlist-button" aria-label="Saved items">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          <strong id="wishlistCount">0</strong>
        </button>
        <button class="header-icon cart-button" aria-label="Shopping bag">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l1 14H3L4 7Z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg>
          <strong id="cartCount">0</strong>
        </button>
      </div>
    </div>
  </header>

  <dialog id="searchDialog" class="search-dialog" aria-label="Search products">
    <div class="search-panel">
      <form id="searchForm" class="overlay-search-form" role="search">
        <div class="overlay-search-field">
          <label for="overlaySearchInput">Search</label>
          <input id="overlaySearchInput" name="q" type="search" autocomplete="off" aria-controls="searchSuggestions" aria-autocomplete="list">
        </div>
        <button type="submit" aria-label="Submit search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></svg></button>
      </form>
      <button class="close-search" type="button" aria-label="Close search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg></button>
      <div id="searchSuggestions" class="search-suggestions" role="listbox" aria-label="Product suggestions" hidden></div>
    </div>
  </dialog>

  <main id="pageRoot" class="page-root" aria-live="polite"></main>

  <nav class="mobile-nav" aria-label="Mobile navigation">
    <a href="#home" data-route="home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg><span>Home</span></a>
    <a href="#categories" data-route="categories"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Categories</span></a>
    <a href="#offers" data-route="offers"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h9l9 9-9 9-9-9V3Z"/><circle cx="7.5" cy="7.5" r="1"/><path d="m10 16 6-6"/><circle cx="10" cy="11" r=".7"/><circle cx="16" cy="15" r=".7"/></svg><span>Offers</span></a>
    <button class="cart-button" aria-label="Open shopping bag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l1 14H3L4 7ZM8 7V5a4 4 0 0 1 8 0v2"/></svg><span>Bag <strong id="mobileCartCount">0</strong></span></button>
  </nav>

  <aside id="cartDrawer" class="cart-drawer" aria-label="Shopping bag">
    <div class="drawer-header">
      <h3>Your Bag</h3>
      <button class="close-drawer" aria-label="Close bag">×</button>
    </div>
    <div id="cartItems" class="cart-items"></div>
    <div id="cartSummary" class="cart-summary"></div>
  </aside>

  <div id="toast" class="store-toast" role="status" aria-live="polite" aria-atomic="true"></div>
  <?php endif; ?>
</body>
</html>
