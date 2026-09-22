<?php

/**
 * Template only. The app does not load this file.
 *
 * Copy .env.example to .env and fill in values. config.php reads .env
 * and exposes a $config array. Do not put real passwords in this file.
 *
 * Keys:
 *   DB_HOST, DB_NAME, DB_USER, DB_PASS
 *   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD
 *   SMTP_FROM_EMAIL, SMTP_FROM_NAME
 *   COMPANY_NAME
 *   CRM_API_URL, CRM_API_KEY, CRM_DEMO_MODE
 *
 * Local defaults used when a key is missing or blank (except passwords):
 *   DB_HOST=127.0.0.1
 *   DB_NAME=lead_management
 *   DB_USER=root
 *   DB_PASS=            (empty is a valid local password)
 *   SMTP_PORT=587
 *   COMPANY_NAME=Acme Services
 *   CRM_DEMO_MODE=true
 *
 * Example shape of $config inside config.php:
 *
 * $config = [
 *     'db_host' => '127.0.0.1',
 *     'db_name' => 'lead_management',
 *     'db_user' => 'root',
 *     'db_pass' => '',
 *     'smtp_host' => '',
 *     'smtp_port' => 587,
 *     'smtp_username' => '',
 *     'smtp_password' => '',
 *     'smtp_from_email' => '',
 *     'smtp_from_name' => 'Acme Services',
 *     'company_name' => 'Acme Services',
 *     'crm_api_url' => '',
 *     'crm_api_key' => '',
 *     'crm_demo_mode' => true,
 * ];
 */

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    http_response_code(403);
    exit('This file is a template. Configure the app with .env.');
}
