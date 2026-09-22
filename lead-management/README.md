# Lead management contact form

A small PHP and MySQL lead form. The visitor submits a name, an Indian mobile number, and an email. The app stores the lead, tries to send a confirmation email, tries a CRM handoff, then shows a thank-you page.

Phone numbers are stored as `+91` plus 10 digits (example: `+91 98765 43210` becomes `+919876543210`). A 10-digit number is kept in full even when it starts with 91. The country code is removed only for a `+91` prefix, or for a 12-digit number that starts with `91`.

No secrets belong in git. Copy `.env.example` to `.env` and fill that in on each machine.

## 1. Installing PHP dependencies

You need PHP 8.0 or newer with these extensions:

- `pdo_mysql`
- `curl`
- `mbstring`

On macOS with Homebrew:

```bash
brew install php composer
php -m | grep -E 'pdo_mysql|curl|mbstring'
```

You also need a MySQL or MariaDB server. Homebrew: `brew install mysql` and start it with `brew services start mysql`.

## 2. Installing PHPMailer

From this directory, install the locked dependency (PHPMailer):

```bash
cd lead-management
composer install
```

That reads `composer.json` and `composer.lock` and creates `vendor/`. `vendor/` is gitignored. On a machine that already has Composer and you are adding the library yourself, `composer require phpmailer/phpmailer` does the same install and updates the lock file.

If the host cannot run Composer, run `composer install` on your laptop and upload the `vendor/` folder with the rest of the app.

## 3. Creating the MySQL database

Start MySQL, then create the database. `database.sql` does this for a local server:

```sql
CREATE DATABASE IF NOT EXISTS lead_management;
```

The local defaults expect database `lead_management` on `127.0.0.1`, user `root`, and an empty password. Change those in `.env` if your MySQL user is different.

## 4. Importing database.sql

From `lead-management`:

```bash
mysql -u root < database.sql
```

Add `-p` if root has a password. The file creates `lead_management` and the `leads` table (`id`, `name`, `phone`, `email`, `created_at`).

## 5. Configuring database credentials

```bash
cp .env.example .env
```

Edit `.env`:

```
DB_HOST=127.0.0.1
DB_NAME=lead_management
DB_USER=root
DB_PASS=
```

`config.php` loads `.env`, then `getenv`. It ships with no passwords. Blank `DB_PASS` is the local default. `config.example.php` lists every key.

## 6. Configuring SMTP

Still in `.env`. Leave these blank to skip real email (the lead is still saved; the failure is written to the PHP error log):

```
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=
COMPANY_NAME=
```

To send mail, set at least `SMTP_HOST` and `SMTP_FROM_EMAIL`. A typical submission port is `587` (STARTTLS). Port `465` uses SSL. `SMTP_USERNAME` and `SMTP_PASSWORD` are the mailbox login. `SMTP_FROM_NAME` and `COMPANY_NAME` are display text. If `COMPANY_NAME` is blank, the header shows `Acme Services`.

The message is sent only through PHPMailer. The app does not call `mail()`.

## 7. Running locally on macOS

```bash
cd lead-management
php -S localhost:8000
```

Open http://localhost:8000

The built-in server uses this directory as the document root. Apache on cPanel uses the same files with no build step.

## 8. Testing the form

1. Open http://localhost:8000
2. Submit an empty form. You should come back to the form with field errors, and nothing new in MySQL.
3. Submit a real row, for example name `Asha Menon`, phone `9876543210` or `+91 98765 43210`, email `asha@example.com`.
4. You should land on the thank-you page. Refreshing it sends you back to the form, because the success flag is one-time.
5. Check the row:

```bash
mysql -u root lead_management -e "SELECT id, name, phone, email, created_at FROM leads ORDER BY id DESC LIMIT 5;"
```

`phone` should look like `+919876543210`.

If SMTP is still empty, the thank-you page still appears. The email error is only in the server log (`php -S` prints `error_log` in the terminal).

## 9. Opening the CRM dashboard

http://localhost:8000/crm-dashboard.php

With `CRM_DEMO_MODE=true` (the default), no external API is called. The dashboard lists the same `leads` table, newest first. There is a small “Lead dashboard” link in the form footer. This page has no login. Do not expose it on a public site without adding protection.

## 10. Deploying to cPanel

1. Upload the `lead-management` folder (FTP or File Manager). Include `vendor/` or run `composer install` over SSH.
2. In cPanel → MySQL Databases, create a database and a user, and grant the user all privileges on that database. Note the prefixed names, often `account_lead_management` and `account_dbuser`.
3. In phpMyAdmin, select that database and import `database.sql`. If `CREATE DATABASE` or `USE` fails because the host names the database for you, skip those two lines and import only the `CREATE TABLE`.
4. Copy `.env.example` to `.env` on the server and set `DB_HOST` (often `localhost`), `DB_NAME`, `DB_USER`, and `DB_PASS`. Set SMTP and `COMPANY_NAME`. Do not commit `.env`.
5. Point the domain’s document root at `lead-management` (or move `index.php`, `process.php`, `thank-you.php`, `crm-dashboard.php`, `css/`, and the PHP includes into `public_html`, keeping the same relative paths).
6. Select PHP 8.0 or newer, with `pdo_mysql`, `curl`, and `mbstring` enabled.
7. `.htaccess` denies web access to `.env`. `db.php`, `config.php`, `email.php`, and `crm.php` also refuse to run when requested directly.

## 11. Configuring the real CRM API

Demo mode is the default, so local setup never calls the network.

When you have an endpoint:

```
CRM_DEMO_MODE=false
CRM_API_URL=https://crm.example.com/api/leads
CRM_API_KEY=your-key-here
```

`crm.php` then sends HTTP POST with `Content-Type: application/json` and this body:

```json
{"name":"Asha Menon","phone":"+919876543210","email":"asha@example.com"}
```

The auth header is:

```
Authorization: Bearer <CRM_API_KEY>
```

If the company API wants a different header (for example `X-API-Key`), change that one line in `crm.php`. The comment above it marks the spot. The dashboard still reads the local `leads` table either way.

A CRM failure does not remove the lead. It is written to the PHP error log, and the visitor still sees the thank-you page.

## How the request flows

1. `index.php` starts a session, stores a CSRF token, and shows the form.
2. The browser POSTs to `process.php`.
3. `process.php` rejects anything that is not POST, then checks the CSRF token with `hash_equals`.
4. It validates the name, phone, and email. Failures go back to `index.php` with field errors in the session. Nothing is inserted.
5. A valid lead is inserted with a PDO prepared statement. The phone saved is `+91` and 10 digits.
6. `email.php` tries PHPMailer SMTP. If SMTP is not set up, or the send throws, the function returns an error. `process.php` logs it and continues. The insert is not rolled back.
7. `crm.php` runs next. In demo mode it returns success without cURL. In live mode it POSTs JSON. A failed call is logged. The insert is not rolled back.
8. Only after the insert succeeds, `process.php` sets a session flag and redirects to `thank-you.php`.
9. `thank-you.php` shows the confirmation, then clears the flag. Opening it directly, or refreshing, redirects to `index.php`.
10. `crm-dashboard.php` reads `leads` and escapes every cell with `htmlspecialchars`.
