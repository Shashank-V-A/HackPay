<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

$leads = [];
$loadError = false;

try {
    $stmt = db()->query(
        'SELECT id, name, phone, email, created_at
         FROM leads
         ORDER BY created_at DESC, id DESC'
    );
    $leads = $stmt->fetchAll();
} catch (Throwable $e) {
    error_log('CRM dashboard query failed: ' . $e->getMessage());
    $loadError = true;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CRM - Lead Dashboard · <?= h($config['company_name']) ?></title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header class="site-header">
        <div class="wrap">
            <p class="brand"><?= h($config['company_name']) ?></p>
            <p class="tagline">Demo view of leads saved in MySQL.</p>
        </div>
    </header>

    <main>
        <div class="wrap">
            <section class="card">
                <h1>CRM - Lead Dashboard</h1>

                <?php if ($loadError): ?>
                    <p class="banner" role="alert">The lead list is unavailable right now.</p>
                <?php elseif ($leads === []): ?>
                    <p class="empty">No leads yet.</p>
                <?php else: ?>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($leads as $lead): ?>
                                    <?php
                                    $created = (string) ($lead['created_at'] ?? '');
                                    $timestamp = strtotime($created);
                                    $displayDate = $timestamp !== false
                                        ? date('Y-m-d H:i', $timestamp)
                                        : $created;
                                    ?>
                                    <tr>
                                        <td><?= h((string) ($lead['id'] ?? '')) ?></td>
                                        <td><?= h((string) ($lead['name'] ?? '')) ?></td>
                                        <td><?= h((string) ($lead['phone'] ?? '')) ?></td>
                                        <td><?= h((string) ($lead['email'] ?? '')) ?></td>
                                        <td><?= h($displayDate) ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                <?php endif; ?>

                <p class="dashboard-back"><a href="index.php">Back to the form</a></p>
            </section>
        </div>
    </main>
</body>
</html>
