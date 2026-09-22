<?php

/**
 * Loads .env (if present) and exposes $config.
 * This file contains no secrets. Put real values in .env.
 */

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    http_response_code(403);
    exit('Direct access is not allowed.');
}

/**
 * Read KEY=VALUE lines from .env into the environment.
 * Existing environment variables win, so a host can inject them.
 */
function load_env_file(string $path): void
{
    if (!is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        $separator = strpos($line, '=');
        if ($separator === false) {
            continue;
        }

        $key = trim(substr($line, 0, $separator));
        $value = trim(substr($line, $separator + 1));

        if ($key === '' || !preg_match('/^[A-Z0-9_]+$/', $key)) {
            continue;
        }

        if (
            strlen($value) >= 2
            && (($value[0] === '"' && str_ends_with($value, '"'))
                || ($value[0] === "'" && str_ends_with($value, "'")))
        ) {
            $value = substr($value, 1, -1);
        }

        if (getenv($key) !== false) {
            continue;
        }

        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }
}

function env_string(string $key, string $default = ''): string
{
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }

    return $value;
}

function env_bool(string $key, bool $default): bool
{
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }

    return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
}

load_env_file(__DIR__ . '/.env');

$companyName = env_string('COMPANY_NAME', 'Acme Services');

$config = [
    'db_host' => env_string('DB_HOST', '127.0.0.1'),
    'db_name' => env_string('DB_NAME', 'lead_management'),
    'db_user' => env_string('DB_USER', 'root'),
    'db_pass' => getenv('DB_PASS') === false ? '' : (string) getenv('DB_PASS'),
    'smtp_host' => env_string('SMTP_HOST', ''),
    'smtp_port' => (int) env_string('SMTP_PORT', '587'),
    'smtp_username' => env_string('SMTP_USERNAME', ''),
    'smtp_password' => getenv('SMTP_PASSWORD') === false ? '' : (string) getenv('SMTP_PASSWORD'),
    'smtp_from_email' => env_string('SMTP_FROM_EMAIL', ''),
    'smtp_from_name' => env_string('SMTP_FROM_NAME', $companyName),
    'company_name' => $companyName,
    'crm_api_url' => env_string('CRM_API_URL', ''),
    'crm_api_key' => getenv('CRM_API_KEY') === false ? '' : (string) getenv('CRM_API_KEY'),
    'crm_demo_mode' => env_bool('CRM_DEMO_MODE', true),
];

function h(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function start_form_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}
