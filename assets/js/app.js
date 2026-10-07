const IMAGE_BASE = (document.body.dataset.assets || 'assets/') + 'images/';

const products = window.LEBROSTONE_CATALOGUE || [];
const articles = window.LEBROSTONE_BLOGS || [];
const categories = ['All', ...new Set(products.map(product => product.category))];
const categoryImages = {
  'Daily Wellness': 'daily-wellness.jpg', "Men's Health": 'mens-health.jpg',
  "Women's Health": 'womens-health.jpg', 'Skin Care': 'skin-care.png',
  'Hair Care': 'hair-care.jpg', 'Weight Management': 'weight-management.jpg',
  'Digestion': 'digestion.jpg', 'Joint Pain': 'joint-pain.jpg',
};

function categoryCarousel() {
  const ordered = [...new Set([...Object.keys(categoryImages), ...categories.filter(category => category !== 'All'), 'All'])].filter(category => categories.includes(category));
  return `<section class="category-browser" aria-label="Shop by category">
    <h2>Shop by category</h2>
    <div class="category-carousel">
      <button class="category-arrow category-prev" data-category-slide="-1" aria-label="Previous categories"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
      <nav class="category-track" aria-label="Product categories">${ordered.map(category => {
        const image = categoryImages[category] ? `categories/${categoryImages[category]}` : category === 'Balm' ? 'catalogue/balm.webp' : 'hero-collection.png';
        return `<a class="category-image-card" href="#shop${category === 'All' ? '' : '?category=' + encodeURIComponent(category)}" data-route="shop" data-category="${escapeHtml(category)}" ${state.route === 'shop' && !state.concern && state.category === category ? 'aria-current="page"' : ''}><img src="${IMAGE_BASE}${image}" alt="" loading="lazy"><span>${category === 'All' ? 'Shop All' : escapeHtml(category)}</span></a>`;
      }).join('')}</nav>
      <button class="category-arrow category-next" data-category-slide="1" aria-label="Next categories"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
    </div>
  </section>`;
}
const navItems = document.querySelectorAll('.main-nav a, .mobile-nav a');
const pageRoot = document.getElementById('pageRoot');
const loader = document.getElementById('loader');
const cartDrawer = document.getElementById('cartDrawer');
const cartItemsEl = document.getElementById('cartItems');
const cartSummaryEl = document.getElementById('cartSummary');
const cartCountEl = document.getElementById('cartCount');
const wishlistCountEl = document.getElementById('wishlistCount');

const announcementMessages = [
  'GET 10% OFF YOUR FIRST ORDER — LEBROSTONE10!',
  'FREE SHIPPING',
  'SECURE CHECKOUT',
  'PREMIUM QUALITY PRODUCT',
];
let announcementIndex = 0;
window.setInterval(() => {
  const bar = document.getElementById('announcementBar');
  const message = document.getElementById('announcementMessage');
  if (!bar || !message || document.hidden) return;
  bar.classList.add('is-changing');
  window.setTimeout(() => {
    announcementIndex = (announcementIndex + 1) % announcementMessages.length;
    message.textContent = announcementMessages[announcementIndex];
    bar.classList.remove('is-changing');
    bar.classList.add('is-entering');
    void message.offsetWidth;
    bar.classList.remove('is-entering');
  }, 1600);
}, 9000);

const state = {
  route: 'home',
  category: 'All',
  concern: '',
  sorting: 'featured',
  search: '',
  savedOnly: false,
  cart: loadFromStorage('lebrostone-cart', {}, normalizeCart),
  wishlist: new Set(loadFromStorage('lebrostone-wishlist', [], normalizeWishlist)),
  activeProduct: null,
  activeArticle: null,
  orderNumber: null,
  adminTab: 'dashboard',
};

function loadFromStorage(key, fallback, normalize) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return normalize(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeCart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, qty]) =>
    getProduct(id) && Number.isSafeInteger(qty) && qty > 0
  ).map(([id, qty]) => {
    const stock = getProduct(id).stockQty;
    return [id, Math.min(qty, 99, Number.isSafeInteger(stock) && stock >= 0 ? stock : 99)];
  }).filter(([, qty]) => qty > 0));
}

function normalizeWishlist(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(id => typeof id === 'string' && getProduct(id));
}

function saveToStorage() {
  try {
    localStorage.setItem('lebrostone-cart', JSON.stringify(state.cart));
    localStorage.setItem('lebrostone-wishlist', JSON.stringify([...state.wishlist]));
  } catch (error) {
    // ignore browser storage issues
  }
  if (typeof window !== 'undefined' && window.queuePreferenceSave) window.queuePreferenceSave();
}

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function getProduct(id) {
  const base = products.find((product) => product.id === id);
  if (base) return base;
  for (const product of products) {
    const variant = (product.variants || []).find((item) => item.id === id);
    if (variant) return { ...product, ...variant };
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}

function priceMarkup(product) {
  if (!(product.price > 0)) return '<span class="price-unavailable">Price currently unavailable</span>';
  const discounted = product.mrp > product.price;
  return `<strong>${money(product.price)}</strong>${discounted ? `<del>${money(product.mrp)}</del><span>${Math.round((1-product.price/product.mrp)*100)}% off</span>` : ''}`;
}

function getCartItems() {
  return Object.entries(state.cart).filter(([id, qty]) => getProduct(id)?.inStock && getProduct(id).price > 0 && Number.isInteger(qty) && qty > 0).map(([id, qty]) => ({ ...getProduct(id), qty }));
}

function updateCounts() {
  const cartTotal = getCartItems().reduce((sum, item) => sum + item.qty, 0);
  cartCountEl.textContent = cartTotal;
  document.getElementById('mobileCartCount').textContent = cartTotal;
  wishlistCountEl.textContent = [...state.wishlist].filter(getProduct).length;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

function showLoader() {
  loader.classList.add('visible');
  setTimeout(() => loader.classList.remove('visible'), 680);
}

function openCart() {
  document.querySelector('.main-nav').classList.remove('open');
  document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
  renderCart();
  cartDrawer.classList.add('open');
}

function closeCart() {
  cartDrawer.classList.remove('open');
}

function addToCart(id) {
  const product = getProduct(id);
  if (!product) return;
  if (!product.inStock || !(product.price > 0)) { showToast('This pack is out of stock'); return; }
  if (product.stockQty !== null && (state.cart[id] || 0) >= product.stockQty) { showToast('Available quantity reached'); return; }
  if ((state.cart[id] || 0) >= 99) { showToast('Maximum 99 per pack'); return; }
  if (!state.cart[id] && Object.keys(state.cart).length >= 100) { showToast('Your bag can hold up to 100 different packs'); return; }
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveToStorage();
  updateCounts();
  renderCart();
  showToast(`${product.name} added to bag`);
  return true;
}

function blinkAddButton(button) {
  clearTimeout(button.cartFeedbackTimer);
  button.classList.remove('is-added');
  void button.offsetWidth;
  button.classList.add('is-added');
  button.cartFeedbackTimer = setTimeout(() => button.classList.remove('is-added'), 600);
}

function updateQty(id, delta) {
  if (!state.cart[id]) return;
  const product = getProduct(id);
  if (delta > 0 && (!product?.inStock || (product.stockQty !== null && state.cart[id] >= product.stockQty))) { showToast('Available quantity reached'); return; }
  if (delta > 0 && state.cart[id] >= 99) { showToast('Maximum 99 per pack'); return; }
  const nextQty = state.cart[id] + delta;
  if (nextQty <= 0) {
    delete state.cart[id];
  } else {
    state.cart[id] = nextQty;
  }
  saveToStorage();
  updateCounts();
  renderCart();
}

function renderCart() {
  const items = getCartItems();
  if (!items.length) {
    cartItemsEl.innerHTML = `
      <div class="empty-state">
        <h3>Your bag is empty</h3>
        <p>Add a few wellness essentials to start your ritual.</p>
      </div>
    `;
    cartSummaryEl.innerHTML = `
      <div class="summary-row"><span>Subtotal</span><span>${money(0)}</span></div>
      <button class="primary-button" data-route="shop">Continue shopping</button>
    `;
    return;
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  cartItemsEl.innerHTML = items.map((item) => `
    <div class="cart-item">
      <img src="${IMAGE_BASE}${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />
      <div>
        <h4>${escapeHtml(item.name)}</h4>
        <p>${money(item.price)} · ${escapeHtml(item.size)}</p>
        <div class="qty-controls">
          <button data-qty="minus" data-id="${escapeHtml(item.id)}" aria-label="Decrease quantity of ${escapeHtml(item.name)}">−</button>
          <span>${item.qty}</span>
          <button data-qty="plus" data-id="${escapeHtml(item.id)}" aria-label="Increase quantity of ${escapeHtml(item.name)}">+</button>
        </div>
        <button type="button" class="cart-remove" data-remove="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from bag">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>
          Remove
        </button>
      </div>
    </div>
  `).join('');

  cartSummaryEl.innerHTML = `
    <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${money(subtotal)}</span></div>
    <button class="primary-button checkout-button" data-route="checkout">Proceed to checkout &rarr;</button>
    <button class="primary-button" data-route="shop">Continue shopping</button>
  `;
}

function updateNavState() {
  navItems.forEach((link) => {
    const isCategoryPage = state.route === 'categories' || state.route === 'product' || (state.route === 'shop' && state.category !== 'All' && !state.savedOnly);
    const isActive = link.dataset.route === 'categories' ? isCategoryPage : (link.dataset.route === 'journal' && state.route === 'article') || link.dataset.route === state.route && (state.route !== 'shop' || (!state.concern && !state.savedOnly && link.dataset.category === state.category));
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
    dropdown.classList.toggle('active', ['video-reviews', 'text-reviews'].includes(state.route));
  });
}

function getVisibleProducts() {
  let filtered = [...products];
  if (state.route === 'offers') filtered = filtered.filter(product => product.inStock && product.price > 0 && product.mrp > product.price);
  if (state.savedOnly) filtered = filtered.filter((product) => state.wishlist.has(product.id));
  if (state.concern) filtered = filtered.filter((product) => product.concerns?.includes(state.concern));

  if (state.category !== 'All') {
    filtered = filtered.filter((product) => product.category === state.category);
  }

  if (state.search) {
    const needle = state.search.toLowerCase();
    filtered = filtered.filter((product) => `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(needle));
  }

  switch (state.sorting) {
    case 'low':
      filtered.sort((a, b) => a.price - b.price);
      break;
    case 'high':
      filtered.sort((a, b) => b.price - a.price);
      break;
    case 'name':
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      filtered.sort((a, b) => (a.badge === 'Best seller' ? -1 : 0) - (b.badge === 'Best seller' ? -1 : 0));
  }

  return filtered;
}

function productCard(product) {
  const isWishlisted = state.wishlist.has(product.id);
  return `
    <article class="product-card">
      <div class="product-visual">
        <button class="product-image-link" data-product="${escapeHtml(product.id)}" aria-label="View ${escapeHtml(product.name)}"><img src="${IMAGE_BASE}${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" /></button>
        <button class="wishlist-toggle ${isWishlisted ? 'active' : ''}" data-wishlist="${escapeHtml(product.id)}" aria-label="Save ${escapeHtml(product.name)}">
          ${isWishlisted ? '♥' : '♡'}
        </button>
        <span class="product-tag ${product.inStock ? '' : 'sold-out-tag'}">${product.inStock ? escapeHtml(product.badge) : 'Out of stock'}</span>
      </div>
      <div class="product-meta">
        <p class="category">${escapeHtml(product.category)}</p>
        <h3><button data-product="${escapeHtml(product.id)}">${escapeHtml(product.name)}</button></h3>
        <span class="size">${escapeHtml(product.size)}</span>
        <div class="product-price">
          ${priceMarkup(product)}
        </div>
        <div class="product-actions">
          <button class="action-button" data-add="${escapeHtml(product.id)}" ${product.inStock && product.price > 0 ? '' : 'disabled'}>${product.inStock && product.price > 0 ? 'Add to bag' : 'Out of stock'}</button>
          <button class="secondary-button" data-product="${escapeHtml(product.id)}">View</button>
        </div>
      </div>
    </article>
  `;
}

function innerHero() {
  return `<section class="collection-banner" aria-label="Discover the Lebrostone collection">
    <img class="collection-banner-art" src="${IMAGE_BASE}collection-banner-wide.png" alt="Lebrostone cream, Multani Mitti soap, Jamun seed powder and Shilajit on a limestone podium surrounded by green foliage" fetchpriority="high">
    <div class="container collection-banner-inner"><div class="collection-banner-copy">
      <p class="collection-banner-kicker">ROOTED IN NATURE</p>
      <h2>Everyday care.<br><em>Beautifully natural.</em></h2>
      <p>For your skin. For your wellness. For you.</p>
      <a class="collection-banner-button" href="#shop" data-route="shop">Shop the collection <span aria-hidden="true">&rarr;</span></a>
    </div></div>
  </section>`;
}

const policyPages = window.LEBROSTONE_POLICIES || {};

function footerMarkup() {
  return `<section class="marketplace-availability simple-available" aria-label="Featured In">
    <div class="container simple-available__inner">
      <h2 class="simple-available__heading">Featured In</h2>
      <ul id="marketplaceSlider" class="marketplace-logos simple-available__grid simple-available__slider" tabindex="0" aria-label="Marketplace logos, scroll horizontally">
        ${[
          ['Blinkit', 'blinkit-wordmark.png', 106],
          ['Flipkart', 'flipkart-wordmark.png', 106],
          ['Instamart', 'instamart-wordmark.png', 68],
          ['JioMart', 'jiomart-wordmark.png', 100],
        ].map(([name, image, height]) => `<li class="marketplace-logo simple-available__item"><img class="simple-available__logo" src="${IMAGE_BASE}marketplaces/${image}" alt="${name}" width="360" height="${height}" loading="lazy"></li>`).join('')}
      </ul>
    </div>
  </section>
  <footer class="store-footer"><div class="container footer-grid">
    <div><h3>Category</h3><a href="#shop" data-route="shop">All products</a><a href="#shop?category=Skin%20Care" data-route="shop" data-category="Skin Care">Skin care</a><a href="#shop?category=Hair%20Care" data-route="shop" data-category="Hair Care">Hair care</a><a href="#shop?category=Daily%20Wellness" data-route="shop" data-category="Daily Wellness">Daily wellness</a><a href="#shop?category=Balm" data-route="shop" data-category="Balm">Balm</a></div>
    <div><h3>Policy</h3><a href="#terms-conditions" data-route="terms-conditions">Terms &amp; conditions</a><a href="#privacy-policy" data-route="privacy-policy">Privacy policy</a><a href="#shipping-policy" data-route="shipping-policy">Shipping &amp; delivery</a><a href="#cancellation-policy" data-route="cancellation-policy">Cancellation policy</a><a href="#return-policy" data-route="return-policy">Returns policy</a><a href="#refund-policy" data-route="refund-policy">Refund policy</a></div>
    <div><h3>Info</h3><a href="#journal" data-route="journal">Blogs</a><a href="#faq" data-route="faq">FAQs</a><a href="#support" data-route="support">Contact us</a><a href="#home" data-route="home">Home</a><a href="#categories" data-route="categories">Categories</a><a href="#offers" data-route="offers">Offers</a><a href="#about" data-route="about">About us</a><button class="cart-button">Shopping bag</button></div>
    <div class="footer-brand"><a href="#home" data-route="home" aria-label="Lebrostone home"><img src="${IMAGE_BASE}logo.png" alt="Lebrostone"></a><p>Rooted in tradition. Care for every day.</p><p>343, Alok Nagar<br>Kanadiya Road, Indore<br>452016, MP, India</p><div class="footer-contact-links"><a href="mailto:info@lebrostone.in">info@lebrostone.in</a><a href="tel:+917067503515">+91 7067503515</a></div></div>
  </div>
  <div class="footer-bottom">&copy; ${new Date().getFullYear()} Lebrostone &middot; Ayurvedic care. Everyday rituals.</div></footer>`;
}

function helpPageHeader(title, description) {
  return `<header class="help-heading"><p class="eyebrow">Lebrostone customer care</p><h1 tabindex="-1" id="helpTitle">${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header>`;
}

let marketplaceTimer;

function startMarketplaceAutoplay() {
  window.clearInterval(marketplaceTimer);
  const slider = document.getElementById('marketplaceSlider');
  if (!slider) return;
  marketplaceTimer = window.setInterval(() => {
    if (!slider.isConnected || document.hidden) return;
    const maxScroll = slider.scrollWidth - slider.clientWidth;
    if (maxScroll <= 1) return;
    if (slider.scrollLeft >= maxScroll - 1) {
      slider.scrollTo({ left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    } else {
      slideMarketplaces(slider, 1);
    }
  }, 3000);
}

function slideMarketplaces(slider, direction) {
  const card = slider.querySelector('.marketplace-logo');
  if (!card) return;
  const gap = parseFloat(window.getComputedStyle(slider).columnGap) || 0;
  slider.scrollBy({
    left: direction * (card.getBoundingClientRect().width + gap),
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

// Routes replace the footer; restart its single autoplay timer after rendering.
new MutationObserver(startMarketplaceAutoplay).observe(pageRoot, { childList: true });

function renderPolicyPage(route) {
  const policy = policyPages[route];
  const updated = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(policy.updatedAt));
  pageRoot.innerHTML = `${innerHero()}<section class="section help-page"><div class="container help-layout">
    <aside class="help-sidebar"><h2>Customer care</h2><nav aria-label="Customer care"><a href="#support" data-route="support">Contact &amp; support</a>${Object.entries(policyPages).map(([slug, item]) => `<a href="#${slug}" data-route="${slug}" ${slug === route ? 'aria-current="page"' : ''}>${escapeHtml(item.title)}</a>`).join('')}</nav></aside>
    <div>${helpPageHeader(policy.title, 'Clear information for your shopping experience.')}<article class="policy-content" aria-labelledby="helpTitle">${policy.html}</article><p class="policy-updated">Policy updated: ${updated}</p><div class="help-callout"><h2>Need a hand?</h2><p>Contact our team for help with delivery, returns or your order.</p><a class="secondary-button" href="#support" data-route="support">Contact support &rarr;</a></div></div>
  </div></section>${footerMarkup()}`;
}

function renderSupportPage() {
  pageRoot.innerHTML = `${innerHero()}<section class="section help-page"><div class="container">
    ${helpPageHeader('Contact & support', 'A little help for your everyday care. Choose how you would like to get in touch.')}
    <div class="support-grid"><article class="support-card"><p class="eyebrow">Product &amp; general enquiries</p><h2>Write to us</h2><p>For product information and general questions, contact the Lebrostone team.</p><a href="mailto:info@lebrostone.in">info@lebrostone.in</a></article>
    <article class="support-card"><p class="eyebrow">Order support</p><h2>Help with an order</h2><p>For delivery issues, returns or refunds, include your order number, contact details and a description of the issue.</p><a href="mailto:Support@lebrostone.com?subject=Lebrostone%20order%20support">Support@lebrostone.com</a></article>
    <article class="support-card"><p class="eyebrow">Contact details</p><h2>Let’s talk</h2><a href="tel:+917067503515">+91 7067503515</a><address>343, Alok Nagar<br>Kanadiya Road, Indore<br>452016, MP, India</address></article></div>
    <p class="support-email-note">Email links open your email app so you can write and send your enquiry.</p>
    <div class="help-callout"><h2>Find an answer</h2><p>Explore our frequently asked questions and shopping policies.</p><div class="help-links"><a href="#faq" data-route="faq">FAQs &rarr;</a><a href="#shipping-policy" data-route="shipping-policy">Shipping &amp; delivery &rarr;</a><a href="#return-policy" data-route="return-policy">Returns &rarr;</a><a href="#refund-policy" data-route="refund-policy">Refunds &rarr;</a></div></div>
  </div></section>${footerMarkup()}`;
}

function blogSection(limit) {
  const shown = limit ? articles.slice(0, limit) : articles;
  return `<section class="section journal-section"><div class="container"><div class="section-header"><div><p class="eyebrow">From the Lebrostone blog</p><h2>Stories for your everyday.</h2></div>${limit ? '<button class="secondary-button" data-route="journal">View all blogs &rarr;</button>' : '<p>Explore the latest articles from Lebrostone.</p>'}</div><div class="journal-grid">${shown.map(article => `<article class="journal-card"><a href="#article?article=${encodeURIComponent(article.id)}" data-route="article" data-article="${escapeHtml(article.id)}" class="journal-image-link"><img src="${IMAGE_BASE}${article.image}" alt="" loading="lazy"></a><div class="content"><p class="eyebrow">${new Date(article.date).toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'})}</p><h3><a href="#article?article=${encodeURIComponent(article.id)}" data-route="article" data-article="${escapeHtml(article.id)}">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.excerpt)}</p><a class="journal-read" href="#article?article=${encodeURIComponent(article.id)}" data-route="article" data-article="${escapeHtml(article.id)}">Read story &rarr;</a></div></article>`).join('')}</div></div></section>`;
}

function renderHomePage() {
  const featured = ['cream', 'balm', 'soap', 'shilajit'].map(getProduct).filter(Boolean);
  const concerns = [
    {title: 'Ringworm & fungal care', subtitle: 'Explore our antifungal cream', position: '0% 0%', product: 'cream'},
    {title: 'Dry & itchy skin', subtitle: 'Explore skin care', position: '100% 0%', category: 'Skin Care'},
    {title: 'Energy Booster', subtitle: 'Explore energy & vitality', image: 'concern-energy-booster.png', concern: 'Energy Booster'},
    {title: 'Acne-prone skin', subtitle: 'Explore cleansing & skin care', position: '0% 100%', category: 'Skin Care'},
    {title: 'Headache', subtitle: 'Explore our pain relief balm', image: 'concern-headache.png', product: 'balm'},
    {title: 'Hair Fall', subtitle: 'Explore hair & scalp care', image: 'concern-hair-fall.png', category: 'Hair Care'},
    {title: 'Scalp & dandruff care', subtitle: 'Explore hair care', position: '100% 100%', category: 'Hair Care'},
  ];
  pageRoot.innerHTML = `
    <section class="botanical-hero collection-hero" aria-labelledby="heroTitle">
      <div class="botanical-hero-art"><img src="${IMAGE_BASE}hero-collection.png" alt="Lebrostone antifungal cream, Multani Mitti soap, Shilajit and Jamun seed powder in a botanical setting" fetchpriority="high" /></div>
      <div class="botanical-hero-copy">
        <p class="hero-kicker">ROOTED IN AYURVEDA</p>
        <h1 id="heroTitle">Nature's goodness.<br><span>Care for every day.</span></h1>
        <div class="botanical-divider" aria-hidden="true">&mdash; &nbsp; &#10022; &nbsp; &mdash;</div>
        <p>From skin care to daily wellness.<br>Discover your Lebrostone ritual.</p>
        <button class="hero-shop-button" data-route="shop">Explore the collection <span aria-hidden="true">&rarr;</span></button>
        <div class="hero-values">
          <div><span aria-hidden="true">&#9752;</span><small>Ayurvedic<br>tradition</small></div>
          <div><span aria-hidden="true">&#9788;</span><small>Everyday<br>wellness</small></div>
          <div><span aria-hidden="true">&#9825;</span><small>Mindful<br>self-care</small></div>
        </div>
      </div>
    </section>
    <div class="benefits-ribbon" aria-label="Our philosophy"><span>Ayurvedic Care</span><i aria-hidden="true">&#10022;</i><span>Inspired by Nature</span><i aria-hidden="true">&#10022;</i><span>Everyday Wellness</span><i aria-hidden="true">&#10022;</i><span>Made with Care</span></div>
    <section class="concerns-section section">
      <div class="container">
        <div class="centered-heading"><p class="eyebrow">A little care, where you need it</p><h2>Shop by concern</h2><p>Find your starting point for skin, scalp and everyday care.</p></div>
        <div class="concerns-grid">${concerns.map((item) => `
          <button class="concern-card" ${item.product ? `data-product="${item.product}"` : item.concern ? `data-route="shop" data-concern="${item.concern}"` : `data-route="shop" data-category="${item.category}"`}>
            <span class="concern-image ${item.image ? 'concern-photo' : ''}" style="background-position: ${item.position || 'center'}">${item.image ? `<img src="${IMAGE_BASE}${item.image}" alt="Illustrative example of ${item.title}" loading="lazy">` : `<span class="visually-hidden">Illustrative example of ${item.title}</span>`}</span>
            <strong>${item.title}</strong><span>${item.subtitle} &rarr;</span>
          </button>`).join('')}
        </div>
        <p class="concern-note">Illustrative skin examples, not a diagnosis or treatment result. Similar-looking rashes can have different causes; ask a clinician if symptoms persist or you are unsure.</p>
      </div>
    </section>
    <section class="cream-feature section" aria-labelledby="creamFeatureTitle">
      <div class="container cream-feature-grid">
        <div class="cream-feature-art">
          <img src="${IMAGE_BASE}cream-spotlight.png" alt="Lebrostone antifungal cream on a stone plinth with botanical leaves" loading="lazy">
          <div class="cream-feature-icons" aria-hidden="true">
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/><path d="M20 2v4M18 4h4"/></svg></span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3c0 5 6 7 6 12a6 6 0 0 1-11 3M6 4c0 3-4 5-4 8a4 4 0 0 0 8 0c0-3-4-5-4-8Z"/></svg></span>
          </div>
        </div>
        <div class="cream-feature-copy"><h2 id="creamFeatureTitle">Lebrostone<br>Anti-fungal<br><span>Cream</span></h2><p>Ayurvedic antifungal cream for your targeted skin-care routine. Explore pack sizes, directions and product details. <button class="cream-read-more" data-product="cream">Read more</button></p>
          <button class="cream-feature-button" data-product="cream">Explore the cream <span aria-hidden="true">&rarr;</span></button>
        </div>
      </div>
    </section>
    <section class="browse-categories section"><div class="container">
      ${categoryCarousel()}
    </div></section>
    <section class="home-showcase section"><div class="container">
      <div class="home-showcase-heading"><div><p class="eyebrow">Discover the collection</p><h2>Everyday essentials</h2><p class="home-showcase-copy">Skin care, herbal powders and wellness, together.</p></div><button class="secondary-button" data-route="shop">Shop all ${products.length} products &rarr;</button></div>
      <div class="product-grid home-featured-grid">${featured.map(productCard).join('')}</div>
    </div></section>
    ${blogSection(3)}
    ${faqSection()}
    ${footerMarkup()}
  `;
}

function faqSection() {
  return `<section class="home-faq section" aria-labelledby="faqTitle">
      <div class="container faq-layout">
        <div class="faq-intro">
          <p class="eyebrow">Frequently asked</p>
          <h2 id="faqTitle">Good care starts with good information.</h2>
          <p>Find a little guidance for your everyday ritual, from choosing a product to understanding pack sizes and directions.</p>
        </div>
        <div class="faq-accordion">
          <details name="storefront-faq" open><summary>Where should I start?<span class="faq-indicator" aria-hidden="true"></span></summary><p>Browse by category or choose a concern above to explore relevant collections. A skin concern is a browsing guide, not a diagnosis.</p></details>
          <details name="storefront-faq"><summary>Which antifungal cream pack sizes are available?<span class="faq-indicator" aria-hidden="true"></span></summary><p>The catalogue lists 15 g and 25 g packs. Open the cream's product page to select a size and see its price.</p></details>
          <details name="storefront-faq"><summary>How do I use a product?<span class="faq-indicator" aria-hidden="true"></span></summary><p>Follow the directions and precautions on its label. For an unexplained or persistent rash, ask a qualified clinician before choosing treatment.</p></details>
          <details name="storefront-faq"><summary>Where can I find more product information?<span class="faq-indicator" aria-hidden="true"></span></summary><p>Open a product to see its description, pack sizes, price and care details. Use the full product information link to explore more on Lebrostone.com.</p></details>
          <details name="storefront-faq"><summary>How can I find a specific product?<span class="faq-indicator" aria-hidden="true"></span></summary><p>Use the search icon to look for a product by name or category. You can also browse the category collections on the home page.</p></details>
        </div>
      </div>
    </section>`;
}

function renderFaqPage() {
  pageRoot.innerHTML = innerHero() + faqSection() + footerMarkup();
}

// Keep the accordion exclusive in browsers without native details grouping.
pageRoot.addEventListener('toggle', (event) => {
  const opened = event.target;
  if (!opened.matches('.faq-accordion details') || !opened.open) return;
  opened.parentElement.querySelectorAll('details[open]').forEach((item) => {
    if (item !== opened) item.open = false;
  });
}, true);

function renderCategoriesPage() {
  const categoryCards = categories.filter(category => category !== 'All').map(category => {
    const categoryProducts = products.filter(product => product.category === category);
    const image = categoryImages[category] ? `categories/${categoryImages[category]}` : categoryProducts[0].image;
    return `<a class="collection-category" href="#shop?category=${encodeURIComponent(category)}" data-route="shop" data-category="${escapeHtml(category)}">
      <img src="${IMAGE_BASE}${escapeHtml(image)}" alt="" loading="lazy">
      <strong>${escapeHtml(category)}</strong>
      <span>${categoryProducts.length} ${categoryProducts.length === 1 ? 'product' : 'products'} &rarr;</span>
    </a>`;
  }).join('');
  pageRoot.innerHTML = `
    ${innerHero()}
    <section class="section browse-categories navigation-page"><div class="container">
      <div class="section-header"><div><p class="eyebrow">Find your everyday ritual</p><h1>Shop by category</h1><p>Explore care for your skin, hair and daily wellness.</p></div><a class="secondary-button" href="#shop" data-route="shop" data-category="All">Shop all products &rarr;</a></div>
      <nav class="collection-category-grid" aria-label="Product categories">${categoryCards}</nav>
    </div></section>${footerMarkup()}`;
}

function renderShopPage() {
  const visible = getVisibleProducts();
  const isOffers = state.route === 'offers';

  pageRoot.innerHTML = `
    ${innerHero()}
    <section class="section detail-page">
      <div class="container">
        <div class="section-header collection-heading"><div><p class="eyebrow">${isOffers ? 'A little more care, for less' : 'The Lebrostone collection'}</p><h1>${isOffers ? 'Offers' : state.savedOnly ? 'Saved items' : escapeHtml(state.concern || (state.category === 'All' ? 'Shop all products' : state.category))}</h1>${isOffers ? '<p>Explore available products with savings on their listed price.</p>' : ''}</div></div>

        <p class="results-count">${state.concern ? `${escapeHtml(state.concern)} &middot; ` : ''}${visible.length} products${state.savedOnly ? ' saved' : ''}${state.search ? ` for &ldquo;${escapeHtml(state.search)}&rdquo; &middot; <a href="#shop" data-route="shop" data-category="${escapeHtml(state.category)}" data-concern="${escapeHtml(state.concern)}">Clear search</a>` : ''}</p>
        <div class="product-grid shop-products">
          ${visible.length ? visible.map((product) => productCard(product)).join('') : `
            <div class="empty-state">
              <h3>${isOffers ? 'No offers available' : 'No matches found'}</h3>
              <p>${isOffers ? 'Check back for savings or explore our full collection.' : 'Try another keyword or switch back to the full collection.'}</p>
              <a class="secondary-button" href="#shop" data-route="shop" data-category="All">Shop all products</a>
            </div>
          `}
        </div>
      </div>
    </section>
    ${footerMarkup()}
  `;

}

function renderJournalPage() {
  pageRoot.innerHTML = innerHero() + blogSection() + footerMarkup();
}

function renderArticlePage(articleId) {
  const article = articles.find(item => item.id === articleId);
  if (!article) {
    pageRoot.innerHTML = `<section class="section"><div class="container empty-state"><h1>Story unavailable</h1><p>This story could not be found.</p><a class="secondary-button" href="#journal" data-route="journal">Back to stories</a></div></section>${footerMarkup()}`;
    return;
  }
  pageRoot.innerHTML = `<section class="section article-page"><article class="container article-content">
    <a class="text-link" href="#journal" data-route="journal">&larr; Back to stories</a>
    <header><p class="eyebrow">From the Lebrostone blog &middot; ${new Date(article.date).toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'})}</p><h1>${escapeHtml(article.title)}</h1></header>
    <img class="article-image" src="${IMAGE_BASE}${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}">
    <div class="article-body"><p>${escapeHtml(article.excerpt)}</p></div>
    <a class="secondary-button" href="#journal" data-route="journal">Explore more stories &rarr;</a>
  </article></section>${footerMarkup()}`;
}

function renderReviewsPage(type) {
  const isVideo = type === 'video-reviews';
  const reviews = window.LEBROSTONE_REVIEWS || [];
  const content = isVideo
    ? (window.LEBROSTONE_VIDEO_REVIEWS || []).length
      ? `<div class="video-reviews-grid">${window.LEBROSTONE_VIDEO_REVIEWS.map((review, index) => `<article class="video-review-card">
          <div class="video-review-media">
            <video preload="metadata" playsinline aria-label="${escapeHtml(review.title)} customer video review">
              <source src="${escapeHtml(review.video)}" type="video/mp4">
            </video>
            <button class="video-review-play" type="button" data-video-play aria-label="Play video review: ${escapeHtml(review.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button>
          </div>
          <div class="video-review-caption">
              <div class="review-stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>
              <h2>${escapeHtml(review.title)}</h2>
              <p>${escapeHtml(review.comment)}</p>
          </div>
        </article>`).join('')}</div>`
      : `<div class="reviews-empty"><h2>Video reviews are unavailable</h2><p>There are no published customer review videos to display right now.</p></div>`
    : reviews.length
      ? `<div class="reviews-grid">${reviews.map(review => `<article class="review-card">
          <div class="review-avatar" aria-hidden="true">${escapeHtml(review.customerName.split(/\s+/).map(name => name[0]).slice(0, 2).join(''))}</div>
          <div class="review-stars" role="img" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
          <blockquote>${escapeHtml(review.comment)}</blockquote>
          <h2>${escapeHtml(review.customerName)}</h2>
        </article>`).join('')}</div>`
      : `<div class="reviews-empty"><h2>Reviews are unavailable</h2><p>There are no published customer reviews to display right now.</p></div>`;

  pageRoot.innerHTML = `${innerHero()}<section class="section reviews-page"><div class="container">
    <header class="reviews-heading"><p class="eyebrow">Customer love</p><h1>${isVideo ? 'Video reviews' : 'Text reviews'}</h1><p>${isVideo ? 'Hear from Lebrostone customers.' : 'A selection of customer reviews published on Lebrostone.com.'}</p></header>
    ${content}
    ${!isVideo ? '<p class="reviews-note">Customer experiences are personal and may vary. Reviews are shared for information and are not medical advice.</p>' : ''}
  </div></section>${footerMarkup()}`;
}

function renderAboutPage() {
  pageRoot.innerHTML = `
    ${innerHero()}
    <section class="section about-intro">
      <div class="container">
        <p class="eyebrow">The Lebrostone story</p>
        <h1>Everyday care,<br><em>rooted in nature.</em></h1>
        <p>Thoughtful skin care, hair care and wellness for the rituals that make up your day.</p>
        <button class="secondary-button" data-route="shop">Discover the collection &rarr;</button>
      </div>
    </section>
    <section class="section about-story">
      <div class="container about-story-grid">
        <div class="about-story-image"><img src="${IMAGE_BASE}hero-collection.png" alt="A selection of Lebrostone wellness and skin-care products" loading="lazy"></div>
        <div class="about-story-copy"><p class="eyebrow">A considered collection</p><h2>Care for the everyday.</h2><p>Lebrostone brings together skin care, hair care and everyday wellness in one place. From familiar Ayurvedic-inspired ingredients to practical daily essentials, our collection is made to help you find products that fit your own routine.</p><p>Explore each product to learn about its ingredients, pack sizes and directions, and choose what feels right for you.</p><span class="story-signature">From the house of Lebroid Healthcare</span></div>
      </div>
    </section>
    <section class="section about-values">
      <div class="container"><div class="about-values-heading"><p class="eyebrow">The Lebrostone approach</p><h2>Good care, made personal.</h2></div>
        <div class="about-values-grid">
          <article><span>01</span><h3>Find your starting point</h3><p>Browse by category or explore collections for skin, hair and everyday wellness.</p></article>
          <article><span>02</span><h3>Get to know each product</h3><p>Review product information, pack sizes and label directions before making a choice.</p></article>
          <article><span>03</span><h3>Make it part of your day</h3><p>Build a routine that works for you, and follow the care guidance on each product.</p></article>
        </div>
      </div>
    </section>
    <section class="section about-collections"><div class="container">
      <div class="about-collections-heading"><p class="eyebrow">Explore Lebrostone</p><h2>Many needs.<br>One thoughtful collection.</h2><p>Find your way to everyday skin care, comfort and wellness.</p></div>
      <div class="about-collection-grid">${[
        {category:'Skin Care',id:'cream',title:'Care that starts with skin.',copy:'Explore skin-care essentials, from antifungal cream to cleansing soaps.'},
        {category:'Balm',id:'balm',title:'A moment for comfort.',copy:'Discover the Lebrostone balm collection and check current product details.'},
        {category:'Daily Wellness',id:'shilajit',title:'Make room for your ritual.',copy:'Explore Shilajit and herbal products in a choice of packs.'}
      ].filter(item => getProduct(item.id)).map(item => `<article class="about-collection"><button class="about-product-image" data-product="${item.id}"><img src="${IMAGE_BASE}${getProduct(item.id).image}" alt="${escapeHtml(getProduct(item.id).name)}" loading="lazy"></button><p class="eyebrow">${item.category}</p><h3>${item.title}</h3><p>${item.copy}</p><button class="link-button" data-route="shop" data-category="${item.category}">Explore ${item.category.toLowerCase()} &rarr;</button></article>`).join('')}</div>
    </div></section>
    ${footerMarkup()}
  `;
}

function renderProductPage(productId) {
  const product = getProduct(productId);
  if (!product) {
    pageRoot.innerHTML = `${innerHero()}<section class="section detail-page"><div class="container empty-state">
      <h1>Product unavailable</h1><p>This product could not be found. Explore the current collection.</p>
      <a class="secondary-button" href="#shop" data-route="shop" data-category="All">Shop all products</a>
    </div></section>${footerMarkup()}`;
    return;
  }
  const parent = products.find(item => item.id === product.id || (item.variants || []).some(pack => pack.id === product.id));
  const packs = [parent, ...(parent.variants || []).filter(pack => pack.id !== parent.sourceVariantId)];

  pageRoot.innerHTML = `
    ${innerHero()}
    <section class="section detail-page">
      <div class="container detail-layout">
        <div class="detail-panel detail-visual">
          <img src="${IMAGE_BASE}${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
        </div>
        <div class="detail-panel detail-content">
          <p class="eyebrow">${escapeHtml(product.category)}</p>
          <h1>${escapeHtml(product.name)}</h1>
          <div class="price-row">
            ${priceMarkup(product)}
          </div>
          <p class="stock-status ${product.inStock ? 'available' : 'unavailable'}">${product.inStock ? 'In stock' : 'Out of stock'}</p>
          <p>${escapeHtml(product.description)}</p>
          <fieldset class="pack-selector"><legend>Select pack size</legend>${packs.map(pack => `<button type="button" class="filter-pill ${pack.id === product.id ? 'active' : ''}" data-pack="${escapeHtml(pack.id)}" aria-pressed="${pack.id === product.id}" ${pack.inStock && pack.price > 0 ? '' : 'disabled'}>${escapeHtml(pack.size)} · ${pack.price > 0 ? money(pack.price) : 'Price unavailable'}${pack.inStock ? '' : ' · Out of stock'}</button>`).join('')}</fieldset>
          <div class="detail-actions">
            <button type="button" class="primary-button" data-buy-now="${escapeHtml(product.id)}" ${product.inStock && product.price > 0 ? '' : 'disabled'}>Buy Now</button>
            <button class="primary-button" data-add="${escapeHtml(product.id)}" ${product.inStock && product.price > 0 ? '' : 'disabled'}>${product.inStock && product.price > 0 ? 'Add to bag' : 'Out of stock'}</button>
            <button class="secondary-button" data-route="shop" data-category="${escapeHtml(product.category)}">Browse more</button>
          </div>
          ${product.sourceUrl ? `<a class="source-product-link" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">Full product information on Lebrostone.com ↗</a>` : ''}
          <div class="detail-meta">
            <div>
              <strong>Size</strong>
              <span>${escapeHtml(product.size)}</span>
            </div>
            <div>
              <strong>Category</strong>
              <span>${escapeHtml(product.category)}</span>
            </div>
            <div>
              <strong>Highlights</strong>
              <span>${escapeHtml(product.details?.[0])}</span>
            </div>
            <div>
              <strong>Care</strong>
              <span>${escapeHtml(product.details?.[2])}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    ${footerMarkup()}
  `;
}

let navigationTimer;
const storefrontTitle = document.title;

function locationRoute() {
  const [requestedRoute, query = ''] = window.location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  return { route: requestedRoute || 'home', options: { category: params.get('category') || 'All', search: params.get('q') || '', productId: params.get('product'), articleId: params.get('article'), concern: params.get('concern') || '', savedOnly: params.get('saved') === '1', orderNumber: params.get('order'), adminTab: params.get('tab') || 'dashboard' } };
}

function renderCurrentRoute() {
  updateNavState();
  const route = state.route;
  if (route === 'home') renderHomePage();
  else if (route === 'faq') renderFaqPage();
  else if (route === 'categories') renderCategoriesPage();
  else if (route === 'shop' || route === 'offers') renderShopPage();
  else if (route === 'journal') renderJournalPage();
  else if (route === 'article') renderArticlePage(state.activeArticle);
  else if (route === 'video-reviews' || route === 'text-reviews') renderReviewsPage(route);
  else if (route === 'about') renderAboutPage();
  else if (route === 'product') renderProductPage(state.activeProduct);
  else if (route === 'support') renderSupportPage();
  else if (['account', 'checkout', 'orders', 'order', 'admin'].includes(route)) {
    if (window.renderCommercePage) window.renderCommercePage(route);
    else pageRoot.innerHTML = '<div class="container section" role="status">Loading your account…</div>';
  }
  else if (Object.prototype.hasOwnProperty.call(policyPages, route)) renderPolicyPage(route);
  if (route === 'article') {
    document.title = `${articles.find(article => article.id === state.activeArticle)?.title || 'Story unavailable'} | Lebrostone`;
    return;
  }
  document.title = policyPages[route]?.title ? `${policyPages[route].title} | Lebrostone` : route === 'support' ? 'Contact & support | Lebrostone' : route === 'categories' ? 'Shop by category | Lebrostone' : route === 'offers' ? 'Offers | Lebrostone' : route === 'video-reviews' ? 'Video reviews | Lebrostone' : route === 'text-reviews' ? 'Text reviews | Lebrostone' : storefrontTitle;
}

function navigate(route, options = {}) {
  if (!['home', 'faq', 'shop', 'categories', 'offers', 'journal', 'article', 'video-reviews', 'text-reviews', 'about', 'product', 'support', 'account', 'checkout', 'orders', 'order', 'admin'].includes(route) && !Object.prototype.hasOwnProperty.call(policyPages, route)) route = 'home';
  document.querySelector('.main-nav').classList.remove('open');
  document.querySelectorAll('.nav-dropdown[open]').forEach((dropdown) => {
    dropdown.open = false;
  });
  document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
  closeCart();
  closeSearch();
  if (route === 'shop' || route === 'offers') {
    state.savedOnly = Boolean(options.savedOnly);
    state.concern = options.concern || '';
    state.category = options.category || 'All';
    state.search = options.search || '';
  }
  if (route === 'product') state.activeProduct = options.productId || null;
  if (route === 'article') state.activeArticle = options.articleId || null;
  if (route === 'order') state.orderNumber = options.orderNumber || null;
  if (route === 'admin') state.adminTab = options.adminTab || 'dashboard';
  state.route = route;
  if (options.history !== false) {
    const params = new URLSearchParams();
    if (route === 'shop' && state.category !== 'All') params.set('category', state.category);
    if (route === 'shop' && state.concern) params.set('concern', state.concern);
    if (route === 'shop' && state.savedOnly) params.set('saved', '1');
    if (route === 'shop' && state.search) params.set('q', state.search);
    if (route === 'product' && state.activeProduct) params.set('product', state.activeProduct);
    if (route === 'article' && state.activeArticle) params.set('article', state.activeArticle);
    if (route === 'order' && state.orderNumber) params.set('order', state.orderNumber);
    if (route === 'admin' && state.adminTab !== 'dashboard') params.set('tab', state.adminTab);
    const hash = `#${route}${params.size ? '?' + params.toString() : ''}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  }
  clearTimeout(navigationTimer);
  showLoader();
  navigationTimer = setTimeout(() => {
    renderCurrentRoute();
    if (route === 'faq') {
      document.getElementById('faqTitle').setAttribute('tabindex', '-1');
      document.getElementById('faqTitle').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      document.getElementById('helpTitle')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 680);
}

window.addEventListener('hashchange', () => {
  const { route, options } = locationRoute();
  navigate(route, { ...options, history: false });
});

document.addEventListener('click', (event) => {
  const videoPlayButton = event.target.closest('[data-video-play]');
  if (videoPlayButton) {
    const video = videoPlayButton.closest('.video-review-media').querySelector('video');
    video.controls = true;
    video.play().catch(() => {
      video.controls = false;
      showToast('This video could not be played. Please try again later.');
    });
    return;
  }

  const categoryArrow = event.target.closest('[data-category-slide]');
  if (categoryArrow) {
    const track = categoryArrow.closest('.category-carousel').querySelector('.category-track');
    const card = track.querySelector('.category-image-card');
    const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).gap);
    const maximum = track.scrollWidth - track.clientWidth;
    const direction = Number(categoryArrow.dataset.categorySlide);
    const target = direction > 0 && track.scrollLeft >= maximum - 2 ? 0 : direction < 0 && track.scrollLeft <= 2 ? maximum : track.scrollLeft + step * direction;
    track.scrollTo({ left: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    return;
  }
  const packButton = event.target.closest('[data-pack]');
  if (packButton) {
    const pack = getProduct(packButton.dataset.pack);
    if (!packButton.disabled && pack?.inStock && pack.price > 0 && pack.id !== state.activeProduct) {
      navigate('product', { productId: pack.id });
    }
    return;
  }
  const buyNowButton = event.target.closest('[data-buy-now]');
  if (buyNowButton) {
    if (!buyNowButton.disabled && addToCart(buyNowButton.dataset.buyNow)) navigate('checkout');
    return;
  }

  const addButton = event.target.closest('[data-add]');
  if (addButton) {
    if (!addButton.disabled && addToCart(addButton.dataset.add)) {
      blinkAddButton(addButton);
      openCart();
    }
    return;
  }

  const wishlistButton = event.target.closest('[data-wishlist]');
  if (wishlistButton) {
    const id = wishlistButton.dataset.wishlist;
    const product = getProduct(id);
    if (!product) return;
    let message;
    if (state.wishlist.has(id)) {
      state.wishlist.delete(id);
      message = `${product.name} removed from wishlist`;
    } else {
      state.wishlist.add(id);
      message = `${product.name} saved to wishlist`;
    }
    saveToStorage();
    updateCounts();
    if (state.route === 'shop' || state.route === 'offers') {
      renderShopPage();
    } else if (state.route === 'home') {
      renderHomePage();
    }
    showToast(message);
    return;
  }

  const productButton = event.target.closest('[data-product]');
  if (productButton) {
    navigate('product', { productId: productButton.dataset.product });
    return;
  }

  const navTrigger = event.target.closest('[data-route]');
  if (navTrigger) {
    if (navTrigger.tagName === 'A' && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0)) return;
    event.preventDefault();
    const route = navTrigger.dataset.route;
    const category = navTrigger.dataset.category;
    if (route === 'article') {
      navigate('article', { articleId: navTrigger.dataset.article });
      return;
    }
    if (route === 'shop') {
      navigate('shop', { category: category || 'All', concern: navTrigger.dataset.concern });
      return;
    }
    navigate(route);
    return;
  }

  const qtyButton = event.target.closest('[data-qty]');
  if (qtyButton) {
    updateQty(qtyButton.dataset.id, qtyButton.dataset.qty === 'plus' ? 1 : -1);
    return;
  }

  const removeButton = event.target.closest('[data-remove]');
  if (removeButton) {
    delete state.cart[removeButton.dataset.remove];
    saveToStorage();
    updateCounts();
    renderCart();
    return;
  }

  if (event.target.closest('.cart-button')) {
    openCart();
    return;
  }

  if (event.target.closest('.close-drawer')) {
    closeCart();
    return;
  }

  if (event.target.closest('.search-button')) {
    closeCart();
    document.querySelector('.main-nav').classList.remove('open');
    document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
    updateSearchScopeLabel();
    const searchInput = document.getElementById('overlaySearchInput');
    searchInput.value = state.search;
    renderSearchSuggestions(state.search);
    document.getElementById('searchDialog').showModal();
    document.body.classList.add('search-open');
    searchInput.focus();
    return;
  }

  const searchSuggestion = event.target.closest('[data-search-suggestion]');
  if (searchSuggestion) {
    const product = getProduct(searchSuggestion.dataset.searchSuggestion);
    if (product) submitProductSearch(product.name);
    return;
  }

  if (event.target.closest('.wishlist-button')) {
    state.category = 'All';
    state.search = '';
    navigate('shop', { category: 'All', savedOnly: true });
    return;
  }

  if (event.target.closest('.menu-button')) {
    const menuOpen = document.querySelector('.main-nav').classList.toggle('open');
    document.querySelector('.menu-button').setAttribute('aria-expanded', String(menuOpen));
    return;
  }

  if (!event.target.closest('.site-header')) {
    document.querySelector('.main-nav').classList.remove('open');
    document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
  }

});

pageRoot.addEventListener('play', (event) => {
  if (event.target.matches('.video-review-media video')) {
    pageRoot.querySelectorAll('.video-review-media video').forEach(video => {
      if (video !== event.target) video.pause();
    });
    event.target.closest('.video-review-media').classList.add('is-playing');
    event.target.closest('.video-review-media').classList.add('has-started');
  }
}, true);

pageRoot.addEventListener('pause', (event) => {
  if (!event.target.matches('.video-review-media video')) return;
  event.target.closest('.video-review-media').classList.remove('is-playing');
}, true);

function closeSearch() {
  const dialog = document.getElementById('searchDialog');
  if (dialog.open) dialog.close();
  document.body.classList.remove('search-open');
}

function currentSearchScope() {
  return state.route === 'shop'
    ? { category: state.category, concern: state.concern }
    : { category: 'All', concern: '' };
}

function updateSearchScopeLabel() {
  const scope = currentSearchScope();
  document.querySelector('label[for="overlaySearchInput"]').textContent = scope.category === 'All'
    ? 'Search products'
    : `Search ${scope.category} products`;
}

function renderSearchSuggestions(query) {
  const suggestions = document.getElementById('searchSuggestions');
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    return;
  }

  const scope = currentSearchScope();
  const matches = products.filter(product => {
    const matchesCategory = scope.category === 'All' || product.category === scope.category;
    const matchesConcern = !scope.concern || product.concerns?.includes(scope.concern);
    const matchesQuery = `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(trimmedQuery);
    return matchesCategory && matchesConcern && matchesQuery;
  }).slice(0, 6);

  suggestions.innerHTML = matches.length
    ? matches.map(product => `<button type="button" class="search-suggestion" role="option" aria-selected="false" data-search-suggestion="${escapeHtml(product.id)}">
        <img src="${IMAGE_BASE}${escapeHtml(product.image)}" alt="" loading="lazy">
        <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)}</small></span>
        <span class="search-suggestion-price">${product.price > 0 ? money(product.price) : 'View product'}</span>
      </button>`).join('')
    : `<p class="search-suggestions-empty" role="status">No matching products${scope.category !== 'All' ? ` in ${escapeHtml(scope.category)}` : ''}.</p>`;
  suggestions.hidden = false;
}

function submitProductSearch(search) {
  const scope = currentSearchScope();
  navigate('shop', { ...scope, search });
}

document.getElementById('overlaySearchInput').addEventListener('input', event => {
  renderSearchSuggestions(event.currentTarget.value);
});

document.getElementById('searchForm').addEventListener('submit', event => {
  event.preventDefault();
  const search = document.getElementById('overlaySearchInput').value.trim();
  submitProductSearch(search);
});
document.querySelector('.close-search').addEventListener('click', closeSearch);
document.getElementById('searchDialog').addEventListener('click', event => {
  if (event.target.id === 'searchDialog') closeSearch();
});
document.getElementById('searchDialog').addEventListener('close', () => document.body.classList.remove('search-open'));

document.addEventListener('keydown', (event) => {
  if (event.target.id === 'marketplaceSlider' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') {
      event.target.scrollTo({ left: event.key === 'Home' ? 0 : event.target.scrollWidth, behavior: 'instant' });
    } else {
      slideMarketplaces(event.target, event.key === 'ArrowLeft' ? -1 : 1);
    }
    return;
  }
  if (event.key === 'Escape') {
    closeCart();
    document.querySelector('.main-nav').classList.remove('open');
    document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('click', (event) => {
  // Cart edits replace the clicked element; the event path retains its original ancestors.
  const clickPath = event.composedPath();
  const clickedInsideBag = clickPath.includes(cartDrawer);
  const clickedBagButton = clickPath.some(node => node.matches?.('.cart-button'));
  const clickedAddButton = clickPath.some(node => node.matches?.('[data-add]'));
  if (cartDrawer.classList.contains('open') && !clickedInsideBag && !clickedBagButton && !clickedAddButton) {
    closeCart();
  }
});

updateCounts();
renderCart();
const initialRoute = locationRoute();
if (initialRoute.route === 'home') {
  renderCurrentRoute();
} else {
  navigate(initialRoute.route, { ...initialRoute.options, history: false });
}
