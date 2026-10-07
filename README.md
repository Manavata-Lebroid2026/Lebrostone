# Lebrostone ecommerce

A PHP/MySQL ecommerce application with a responsive HTML/CSS/JavaScript storefront, customer accounts, saved carts and wishlists, delivery details, orders, inventory tracking and an admin panel. Payment methods are intentionally not implemented.

## Local setup

1. Put the project at `C:/xampp/htdocs/Lebrostone`.
2. Start Apache and MySQL in XAMPP. PHP with PDO MySQL, mbstring and fileinfo is required. The code is tested on the supplied PHP 7.3 installation.
3. Run from the project root:

   ```powershell
   C:/xampp/php/php.exe database/setup.php
   ```

4. Open `http://localhost/Lebrostone/`.
5. Use the account icon to register or sign in.

Setup imports 113 products and 9 categories and creates the customer/order tables. Running setup again applies supported schema additions and preserves existing products and accounts. No npm install or frontend build is needed.

## Administrator access

Register your own account on the website, then promote that registered email from the command line:

```text
php database/promote-admin.php your-email@example.com
```

Open `http://localhost/Lebrostone/#admin`. The account menu also shows **Admin panel** for administrators. There are no default administrator credentials. Admin access is enforced by the PHP API, not just by hiding buttons.

Administrators can:

- View product, customer and order counts and submitted order value.
- Create/edit products, categories, descriptions, photos, pack variants, prices and inventory.
- Archive products without deleting historical order records.
- View orders and delivery details and update their status.
- Record a tracking number before marking an order shipped.
- Enable or disable customer accounts.

Product editing detects intervening stock/product changes and requires reloading rather than silently overwriting newer data. Uploaded photos are stored in `assets/images/uploads/`; include that folder when backing up an operating store.

## Customer features

- Register, sign in, sign out, edit personal details and change passwords.
- Search and browse categories, products, offers, reviews, articles and policies.
- Save favourites and edit the shopping bag.
- Synchronize signed-in carts and wishlists with MySQL; guests use browser localStorage.
- Review a server-calculated total, apply the first-order `LEBROSTONE10` coupon, and enter an Indian delivery address.
- Submit an order, view order history, delivery information, tracking number and status progress.
- Cancel an order while it is pending or confirmed.

The latest delivery address is saved to the customer account for the next checkout. Shipping is currently free. The maximum quantity per pack is 99. Orders snapshot the product names, pack sizes and prices so later catalogue edits do not change past orders.

## Orders and inventory

Order status progresses through `pending`, `confirmed`, `packed`, `shipped`, and `delivered`. Administrators can cancel before shipping; customers can cancel pending or confirmed orders. Stock is reserved when an order is submitted and restored once on cancellation. Untracked inventory remains untracked.

Prices, coupons and available stock are validated on the server. Stock updates and order creation run in a transaction with row locks. An idempotency key prevents duplicate orders from retries. The browser retains a pending request key across reloads when localStorage is available.

No payment is collected or marked as paid. Orders are submitted for store confirmation. There is no payment gateway or cash-on-delivery selection. Automated email/SMS notifications, forgotten-password recovery, carrier booking, refunds and tax-invoice generation are not configured. These remain separate deployment features.

## Project structure

```text
Lebrostone/
|-- index.php                         Website entry point
|-- api.php                           JSON API entry point
|-- application/
|   |-- session.php                   Sessions and optional preview access
|   |-- database.php                  PDO connection and catalogue queries
|   |-- commerce.php                  Accounts, orders, stock and admin services
|   |-- controllers/Storefront.php    Optional CodeIgniter 3 controller
|   `-- views/storefront.php          Shared HTML layout
|-- assets/
|   |-- css/                          Storefront, commerce and Bootstrap styles
|   |-- js/                           Storefront, account/admin screens and content
|   `-- images/                       Storefront and product photos
|-- database/
|   |-- schema.sql                    Catalogue tables
|   |-- commerce.sql                  Customer and order tables
|   |-- catalogue.json                Initial product seed
|   |-- setup.php                     CLI installation/migration
|   `-- promote-admin.php             CLI admin promotion
|-- tests/                            Database, API and frontend regression checks
|-- .htaccess                         Blocks HTTP access to internal folders
|-- .gitignore
`-- README.md
```

## Configuration

Local database defaults are `127.0.0.1:3306`, database `lebrostone`, user `root`, and an empty password. Override them with environment variables available to PHP/Apache:

| Variable | Purpose |
|---|---|
| `LEBROSTONE_DB_HOST` | Database hostname |
| `LEBROSTONE_DB_PORT` | Database port |
| `LEBROSTONE_DB_NAME` | Database name |
| `LEBROSTONE_DB_USER` | Database username |
| `LEBROSTONE_DB_PASSWORD` | Database password |
| `LEBROSTONE_STORE_PASSWORD` | Optional shared preview password |

The website opens directly when `LEBROSTONE_STORE_PASSWORD` is unset. Setting it enables the optional preview gate; there is no hardcoded fallback password. Customer authentication is separate from this gate.

Use HTTPS when hosting the site; checkout uses browser Web Crypto, which also works on localhost. Authentication uses hashed passwords, HttpOnly/SameSite session cookies, CSRF tokens and login throttling. Password changes and account disabling invalidate existing account sessions. Configure a dedicated database user for deployment and back up both MySQL and uploaded photos.

Apache's `.htaccess` blocks `application/`, `database/` and `tests/` and disables directory listing. If deploying with another web server, apply equivalent access rules. The PHP built-in server used by API tests does not process Apache access rules.

## Verification

Run from the project root:

```text
php tests/verify-database.php
php tests/verify-commerce.php
php tests/verify-api.php
node tests/verify-storage.cjs
node tests/verify-bag.cjs
node tests/verify-assets.cjs
node tests/verify-commerce-ui.cjs
node --check assets/js/app.js
node --check assets/js/commerce.js
```

The commerce and HTTP API tests create uniquely named disposable databases and remove them afterward; they do not modify live shop data. The API test starts a temporary localhost PHP server and checks photo uploads, cleaning up its own upload. These tests require local database create/drop privileges; the HTTP test also requires cURL and process launching.

`verify-database.php` checks the seeded catalogue against the original snapshot. Intentional admin edits can change that comparison. Frontend tests use a DOM fixture and are not a substitute for browser visual testing. Browser/mobile visual review, HTTPS deployment checks and hosting configuration remain necessary before public launch.

## CodeIgniter 3 integration

This includes an integration controller, not a complete CI3 installation. Copy the application service/session files, controller, view, assets and `api.php` into an existing CI3 project. Configure `base_url`, route to `storefront`, and set the same database environment variables. Keep CI3's own front controller. The controller supplies the standalone API URL. Initialize the database using this repository's setup script first.

## Content

Product, blog, policy and review data originated from public Lebrostone snapshots. Some banners and concern illustrations were generated or edited during design. Blog stories open internal pages with saved titles, images, dates and summaries; full article bodies are not included in the snapshot. Review videos use external URLs. Review product information, promotions, policies and generated packaging details before launch. The visual layout was informed by Turcy, but the supplied Turcy HTML is not included in this project.
