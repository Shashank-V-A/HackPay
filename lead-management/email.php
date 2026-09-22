<?php

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    http_response_code(403);
    exit('Direct access is not allowed.');
}

require_once __DIR__ . '/config.php';

/**
 * Send the confirmation email with PHPMailer over SMTP.
 *
 * Returns ['ok' => bool, 'error' => string]. Never throws.
 * A failure here must not undo the saved lead.
 */
function send_confirmation_email(string $name, string $phone, string $email): array
{
    global $config;

    if ($config['smtp_host'] === '' || $config['smtp_from_email'] === '') {
        return [
            'ok' => false,
            'error' => 'SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL.',
        ];
    }

    $autoload = __DIR__ . '/vendor/autoload.php';
    if (!is_file($autoload)) {
        return [
            'ok' => false,
            'error' => 'PHPMailer is not installed. Run composer install in lead-management.',
        ];
    }

    require_once $autoload;

    try {
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $config['smtp_host'];
        $mail->Port = $config['smtp_port'] > 0 ? $config['smtp_port'] : 587;
        $mail->SMTPAuth = $config['smtp_username'] !== '';
        $mail->Username = $config['smtp_username'];
        $mail->Password = $config['smtp_password'];
        $mail->SMTPSecure = $mail->Port === 465
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->CharSet = 'UTF-8';
        $mail->Timeout = 15;

        $mail->setFrom($config['smtp_from_email'], $config['smtp_from_name']);
        $mail->addAddress($email, $name);
        $mail->Subject = 'Thank You for Your Submission';
        $mail->isHTML(false);
        $mail->Body = implode("\n", [
            'Hi ' . $name . ',',
            '',
            'Thank you for submitting the form.',
            '',
            'We have successfully received your details.',
            '',
            'Name: ' . $name,
            'Phone: ' . $phone,
            'Email: ' . $email,
            '',
            'We will get back to you shortly.',
            '',
            'Regards,',
            $config['company_name'],
        ]);

        $mail->send();
    } catch (Throwable $e) {
        return [
            'ok' => false,
            'error' => 'PHPMailer error: ' . $e->getMessage(),
        ];
    }

    return ['ok' => true, 'error' => ''];
}
