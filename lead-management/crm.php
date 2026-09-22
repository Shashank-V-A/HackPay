<?php

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    http_response_code(403);
    exit('Direct access is not allowed.');
}

require_once __DIR__ . '/config.php';

/**
 * Hand the lead to an external CRM.
 *
 * CRM_DEMO_MODE=true (the local default) skips the network and returns
 * success. The lead is already stored in MySQL; crm-dashboard.php reads it.
 *
 * CRM_DEMO_MODE=false sends HTTP POST JSON:
 *   {"name","phone","email"}
 *
 * Auth header (change this one line if a company API expects something else):
 *   Authorization: Bearer <CRM_API_KEY>
 *
 * Returns ['ok' => bool, 'error' => string]. Never throws.
 */
function send_lead_to_crm(string $name, string $phone, string $email): array
{
    global $config;

    if ($config['crm_demo_mode']) {
        return ['ok' => true, 'error' => ''];
    }

    if ($config['crm_api_url'] === '') {
        return ['ok' => false, 'error' => 'CRM_API_URL is not configured.'];
    }

    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'cURL is not available on this server.'];
    }

    $payload = json_encode([
        'name' => $name,
        'phone' => $phone,
        'email' => $email,
    ]);

    if ($payload === false) {
        return ['ok' => false, 'error' => 'Could not encode the CRM payload.'];
    }

    $ch = curl_init($config['crm_api_url']);
    if ($ch === false) {
        return ['ok' => false, 'error' => 'Could not start the CRM request.'];
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            // Company APIs sometimes want X-API-Key or a custom header.
            // Replace the next line; leave the JSON body as it is.
            'Authorization: Bearer ' . $config['crm_api_key'],
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);

    $response = curl_exec($ch);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($errno !== 0) {
        return ['ok' => false, 'error' => 'CRM request failed: ' . $error];
    }

    if ($status < 200 || $status >= 300) {
        $snippet = is_string($response) ? substr(trim($response), 0, 200) : '';
        $detail = 'CRM responded with HTTP ' . $status;
        if ($snippet !== '') {
            $detail .= ' ' . $snippet;
        }

        return ['ok' => false, 'error' => $detail];
    }

    return ['ok' => true, 'error' => ''];
}
