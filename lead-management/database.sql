-- Lead form schema.
-- Local:  mysql -u root < database.sql
-- cPanel: create the database in the panel first. If the host prefixes
-- the name, skip the next two lines and import only the CREATE TABLE
-- into the database you already selected in phpMyAdmin.

CREATE DATABASE IF NOT EXISTS lead_management;
USE lead_management;

CREATE TABLE IF NOT EXISTS leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
