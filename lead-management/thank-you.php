<?php

require_once __DIR__ . '/config.php';

start_form_session();

if (empty($_SESSION['lead_submitted'])) {
    header('Location: index.php');
    exit;
}

unset($_SESSION['lead_submitted']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Thank You · <?= h($config['company_name']) ?></title>
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
                <h1>Thank You!</h1>
                <p>The form has been submitted successfully.</p>
                <p>You will receive a confirmation email shortly.</p>
                <a class="button" href="index.php">Back to Home</a>
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
