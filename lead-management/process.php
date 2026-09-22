<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/email.php';
require_once __DIR__ . '/crm.php';

start_form_session();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit('Method not allowed.');
}

$postedToken = $_POST['csrf_token'] ?? '';
$sessionToken = $_SESSION['csrf_token'] ?? '';

if (
    !is_string($postedToken)
    || !is_string($sessionToken)
    || $sessionToken === ''
    || !hash_equals($sessionToken, $postedToken)
) {
    error_log('Lead form rejected: CSRF token mismatch.');
    $_SESSION['form_flash'] = 'Please submit the form again.';
    header('Location: index.php');
    exit;
}

$name = trim((string) ($_POST['name'] ?? ''));
$phone = trim((string) ($_POST['phone'] ?? ''));
$email = trim((string) ($_POST['email'] ?? ''));

$errors = [];

$nameError = validate_name($name);
if ($nameError !== null) {
    $errors['name'] = $nameError;
}

[$normalizedPhone, $phoneError] = normalize_indian_phone($phone);
if ($phoneError !== null) {
    $errors['phone'] = $phoneError;
}

$emailError = validate_email_address($email);
if ($emailError !== null) {
    $errors['email'] = $emailError;
}

if ($errors !== []) {
    $_SESSION['form_errors'] = $errors;
    $_SESSION['form_old'] = [
        'name' => clip_text($name, 100),
        'phone' => clip_text($phone, 20),
        'email' => clip_text($email, 150),
    ];
    header('Location: index.php');
    exit;
}

try {
    $stmt = db()->prepare(
        'INSERT INTO leads (name, phone, email) VALUES (:name, :phone, :email)'
    );
    $stmt->execute([
        ':name' => $name,
        ':phone' => $normalizedPhone,
        ':email' => $email,
    ]);
} catch (Throwable $e) {
    error_log('Lead insert failed: ' . $e->getMessage());
    $_SESSION['form_flash'] = 'We could not save your details. Please try again.';
    $_SESSION['form_old'] = [
        'name' => $name,
        'phone' => $phone,
        'email' => $email,
    ];
    header('Location: index.php');
    exit;
}

// The row is already committed. Email and CRM failures are logged only.
$emailResult = send_confirmation_email($name, $normalizedPhone, $email);
if (!$emailResult['ok']) {
    error_log('Confirmation email failed: ' . $emailResult['error']);
}

$crmResult = send_lead_to_crm($name, $normalizedPhone, $email);
if (!$crmResult['ok']) {
    error_log('CRM handoff failed: ' . $crmResult['error']);
}

$_SESSION['lead_submitted'] = true;
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

header('Location: thank-you.php');
exit;

function validate_name(string $name): ?string
{
    if ($name === '') {
        return 'Full name is required.';
    }

    $length = mb_strlen($name);
    if ($length < 2 || $length > 100) {
        return 'Full name must be between 2 and 100 characters.';
    }

    if (!preg_match('/^\p{L}[\p{L}\s.\'\x{2019}-]*$/u', $name)) {
        return 'Full name may only contain letters, spaces, periods, hyphens, and apostrophes.';
    }

    return null;
}

/**
 * Accept a 10-digit Indian mobile (starts 6-9), with an optional +91 or 91
 * prefix and spaces or hyphens. Store +91 followed by those 10 digits.
 *
 * @return array{0: string, 1: null}|array{0: null, 1: string}
 */
function normalize_indian_phone(string $phone): array
{
    if ($phone === '') {
        return [null, 'Phone number is required.'];
    }

    if (strlen($phone) > 20) {
        return [null, 'Phone number must be 20 characters or fewer.'];
    }

    if (!preg_match('/^[0-9+\s-]+$/', $phone)) {
        return [null, 'Enter a valid 10-digit Indian mobile number. A +91 prefix is optional.'];
    }

    $compact = str_replace([' ', '-'], '', $phone);

    if (str_starts_with($compact, '+91')) {
        $digits = substr($compact, 3);
    } elseif (strlen($compact) === 12 && str_starts_with($compact, '91')) {
        $digits = substr($compact, 2);
    } else {
        $digits = $compact;
    }

    if (!preg_match('/^[6-9][0-9]{9}$/', $digits)) {
        return [null, 'Enter a valid 10-digit Indian mobile number. A +91 prefix is optional.'];
    }

    return ['+91' . $digits, null];
}

function validate_email_address(string $email): ?string
{
    if ($email === '') {
        return 'Email address is required.';
    }

    if (strlen($email) > 150) {
        return 'Email address must be 150 characters or fewer.';
    }

    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return 'Enter a valid email address.';
    }

    return null;
}

function clip_text(string $value, int $max): string
{
    if (mb_strlen($value) <= $max) {
        return $value;
    }

    return mb_substr($value, 0, $max);
}
