<?php

require_once __DIR__ . '/config.php';

start_form_session();

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$errors = $_SESSION['form_errors'] ?? [];
$old = $_SESSION['form_old'] ?? [];
$flash = $_SESSION['form_flash'] ?? '';
unset($_SESSION['form_errors'], $_SESSION['form_old'], $_SESSION['form_flash']);

if (!is_array($errors)) {
    $errors = [];
}
if (!is_array($old)) {
    $old = [];
}

$name = isset($old['name']) ? (string) $old['name'] : '';
$phone = isset($old['phone']) ? (string) $old['phone'] : '';
$email = isset($old['email']) ? (string) $old['email'] : '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Get in Touch · <?= h($config['company_name']) ?></title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header class="site-header">
        <div class="wrap">
            <p class="brand"><?= h($config['company_name']) ?></p>
            <p class="tagline">A short note is enough. We will call you back.</p>
        </div>
    </header>

    <main>
        <div class="wrap">
            <section class="card card-narrow">
                <h1>Get in Touch</h1>
                <p class="intro">Share your name, phone number, and email. All three are required.</p>

                <?php if ($flash !== ''): ?>
                    <p class="banner" role="alert"><?= h((string) $flash) ?></p>
                <?php endif; ?>

                <form method="post" action="process.php" novalidate>
                    <input type="hidden" name="csrf_token" value="<?= h($_SESSION['csrf_token']) ?>">

                    <div class="field">
                        <label for="name">Full Name</label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            maxlength="100"
                            required
                            autocomplete="name"
                            value="<?= h($name) ?>"
                        >
                        <?php if (!empty($errors['name'])): ?>
                            <p class="field-error"><?= h((string) $errors['name']) ?></p>
                        <?php endif; ?>
                    </div>

                    <div class="field">
                        <label for="phone">Phone Number</label>
                        <input
                            type="tel"
                            id="phone"
                            name="phone"
                            maxlength="20"
                            required
                            autocomplete="tel"
                            placeholder="9876543210"
                            value="<?= h($phone) ?>"
                        >
                        <p class="hint">10-digit Indian mobile. +91 is optional.</p>
                        <?php if (!empty($errors['phone'])): ?>
                            <p class="field-error"><?= h((string) $errors['phone']) ?></p>
                        <?php endif; ?>
                    </div>

                    <div class="field">
                        <label for="email">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            maxlength="150"
                            required
                            autocomplete="email"
                            value="<?= h($email) ?>"
                        >
                        <?php if (!empty($errors['email'])): ?>
                            <p class="field-error"><?= h((string) $errors['email']) ?></p>
                        <?php endif; ?>
                    </div>

                    <button type="submit">Submit</button>
                </form>
            </section>
        </div>
    </main>

    <footer class="site-footer">
        <div class="wrap">
            <a href="crm-dashboard.php">Lead dashboard</a>
        </div>
    </footer>
</body>
</html>
