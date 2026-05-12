-- ============================================================================
-- UwaisSuperApps - Application Database Migration
-- Migration: 001_create_app_db_tables.sql
-- Description: Creates all application database tables with indexes,
--              foreign keys, and constraints
-- Engine: InnoDB | Charset: UTF8MB4
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- Table: branches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `branches` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `address` TEXT NULL,
  `contact_phone` VARCHAR(20) NULL,
  `contact_email` VARCHAR(100) NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `role` ENUM('Superadmin', 'Admin', 'Accounting', 'Mitra', 'Sales', 'Merchant', 'Teknisi', 'Pelanggan') NOT NULL,
  `branch_id` INT UNSIGNED NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `profit_sharing_pct` DECIMAL(5,2) NULL COMMENT 'Mitra only',
  `commission_amount` DECIMAL(12,2) NULL COMMENT 'Merchant only',
  `saldo` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Mitra/Merchant balance',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  INDEX `idx_users_branch_id` (`branch_id`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_status` (`status`),
  CONSTRAINT `fk_users_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: customers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(150) NOT NULL,
  `ktp_number` VARCHAR(20) NOT NULL,
  `npwp_number` VARCHAR(30) NULL,
  `whatsapp_number` VARCHAR(20) NOT NULL,
  `email` VARCHAR(100) NULL,
  `address` TEXT NOT NULL,
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `lifecycle_status` ENUM('Prospek', 'Instalasi', 'Aktif', 'Isolir', 'Terminated') NOT NULL DEFAULT 'Prospek',
  `branch_id` INT UNSIGNED NOT NULL,
  `registered_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customers_ktp_number` (`ktp_number`),
  INDEX `idx_customers_branch_id` (`branch_id`),
  INDEX `idx_customers_lifecycle_status` (`lifecycle_status`),
  INDEX `idx_customers_registered_by` (`registered_by`),
  CONSTRAINT `fk_customers_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_customers_registered_by` FOREIGN KEY (`registered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: customer_audit_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_audit_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `previous_status` ENUM('Prospek', 'Instalasi', 'Aktif', 'Isolir', 'Terminated') NOT NULL,
  `new_status` ENUM('Prospek', 'Instalasi', 'Aktif', 'Isolir', 'Terminated') NOT NULL,
  `actor_id` INT UNSIGNED NOT NULL,
  `changed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_audit_customer_id` (`customer_id`),
  INDEX `idx_audit_actor_id` (`actor_id`),
  CONSTRAINT `fk_audit_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: packages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `packages` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `upload_rate_limit` INT NOT NULL COMMENT 'kbps',
  `download_rate_limit` INT NOT NULL COMMENT 'kbps',
  `upload_burst_limit` INT NOT NULL COMMENT 'kbps',
  `download_burst_limit` INT NOT NULL COMMENT 'kbps',
  `upload_burst_threshold` INT NOT NULL COMMENT 'kbps',
  `download_burst_threshold` INT NOT NULL COMMENT 'kbps',
  `monthly_price` DECIMAL(12,2) NOT NULL,
  `ppn_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `fup_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `fup_quota_gb` INT NULL COMMENT 'FUP quota in GB',
  `fup_upload_speed` INT NULL COMMENT 'kbps, speed after FUP',
  `fup_download_speed` INT NULL COMMENT 'kbps, speed after FUP',
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_packages_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: nas_devices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `nas_devices` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `radius_secret` VARCHAR(100) NOT NULL,
  `api_port` INT NOT NULL DEFAULT 8728,
  `branch_id` INT UNSIGNED NOT NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `vpn_accounts` TEXT NULL COMMENT 'JSON: 4 VPN account configs',
  `config_script` TEXT NULL COMMENT 'Generated Mikrotik script',
  `last_poll_at` TIMESTAMP NULL,
  `poll_status` ENUM('Up', 'Down') NULL,
  `active_sessions` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_nas_branch_id` (`branch_id`),
  INDEX `idx_nas_status` (`status`),
  CONSTRAINT `fk_nas_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: olts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `olts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `total_pon_ports` INT NOT NULL,
  `branch_id` INT UNSIGNED NOT NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_olts_branch_id` (`branch_id`),
  INDEX `idx_olts_status` (`status`),
  CONSTRAINT `fk_olts_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: odps
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `odps` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `total_ports` INT NOT NULL,
  `used_ports` INT NOT NULL DEFAULT 0,
  `olt_id` INT UNSIGNED NULL,
  `olt_pon_port` INT NULL,
  `branch_id` INT UNSIGNED NOT NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_odps_branch_id` (`branch_id`),
  INDEX `idx_odps_olt_id` (`olt_id`),
  INDEX `idx_odps_status` (`status`),
  CONSTRAINT `fk_odps_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_odps_olt` FOREIGN KEY (`olt_id`) REFERENCES `olts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `package_id` INT UNSIGNED NOT NULL,
  `pppoe_username` VARCHAR(50) NOT NULL,
  `pppoe_password` VARCHAR(100) NOT NULL,
  `nas_id` INT UNSIGNED NULL,
  `odp_id` INT UNSIGNED NULL,
  `odp_port` INT NULL,
  `onu_serial_number` VARCHAR(50) NULL,
  `onu_mac_address` VARCHAR(17) NULL,
  `install_latitude` DECIMAL(10,7) NULL,
  `install_longitude` DECIMAL(10,7) NULL,
  `status` ENUM('Pending', 'Active', 'Suspended', 'Terminated') NOT NULL DEFAULT 'Pending',
  `activated_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subscriptions_pppoe_username` (`pppoe_username`),
  INDEX `idx_subscriptions_customer_id` (`customer_id`),
  INDEX `idx_subscriptions_package_id` (`package_id`),
  INDEX `idx_subscriptions_nas_id` (`nas_id`),
  INDEX `idx_subscriptions_odp_id` (`odp_id`),
  INDEX `idx_subscriptions_status` (`status`),
  CONSTRAINT `fk_subscriptions_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_subscriptions_package` FOREIGN KEY (`package_id`) REFERENCES `packages` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_subscriptions_nas` FOREIGN KEY (`nas_id`) REFERENCES `nas_devices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_subscriptions_odp` FOREIGN KEY (`odp_id`) REFERENCES `odps` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: invoices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(30) NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `subscription_id` INT UNSIGNED NOT NULL,
  `billing_period` VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  `base_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `ppn_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `installation_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `addon_charges` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `dp_deduction` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('UNPAID', 'LUNAS', 'WAIVED', 'CANCELLED') NOT NULL DEFAULT 'UNPAID',
  `due_date` DATE NOT NULL,
  `generation_date` DATE NOT NULL,
  `waiver_reason` VARCHAR(255) NULL,
  `paid_at` TIMESTAMP NULL,
  `payment_method` VARCHAR(50) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invoices_invoice_number` (`invoice_number`),
  INDEX `idx_invoices_customer_id` (`customer_id`),
  INDEX `idx_invoices_subscription_id` (`subscription_id`),
  INDEX `idx_invoices_status` (`status`),
  INDEX `idx_invoices_billing_period` (`billing_period`),
  INDEX `idx_invoices_due_date` (`due_date`),
  CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_invoices_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `method` VARCHAR(50) NOT NULL COMMENT 'VA, QRIS, Minimarket, Mitra, Merchant, Cash',
  `tripay_reference` VARCHAR(100) NULL,
  `processed_by` INT UNSIGNED NULL COMMENT 'users.id - Mitra/Merchant/Admin',
  `admin_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Merchant commission',
  `status` ENUM('Pending', 'Success', 'Failed', 'Expired') NOT NULL DEFAULT 'Pending',
  `paid_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_payments_invoice_id` (`invoice_id`),
  INDEX `idx_payments_status` (`status`),
  INDEX `idx_payments_processed_by` (`processed_by`),
  CONSTRAINT `fk_payments_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: saldo_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saldo_transactions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL COMMENT 'Mitra or Merchant',
  `type` ENUM('Topup', 'Deduction', 'Refund') NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `balance_after` DECIMAL(15,2) NOT NULL,
  `reference` VARCHAR(100) NULL COMMENT 'invoice_id or topup ref',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_saldo_user_id` (`user_id`),
  INDEX `idx_saldo_type` (`type`),
  CONSTRAINT `fk_saldo_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: coa_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coa_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subscription_id` INT UNSIGNED NOT NULL,
  `nas_id` INT UNSIGNED NOT NULL,
  `trigger_type` ENUM('SpeedChange', 'Isolir', 'Unisolir', 'FUP', 'Kick') NOT NULL,
  `request_payload` TEXT NULL,
  `response_status` ENUM('ACK', 'NAK', 'Timeout', 'Pending') NOT NULL DEFAULT 'Pending',
  `retry_count` INT NOT NULL DEFAULT 0,
  `sent_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_coa_subscription_id` (`subscription_id`),
  INDEX `idx_coa_nas_id` (`nas_id`),
  INDEX `idx_coa_trigger_type` (`trigger_type`),
  INDEX `idx_coa_response_status` (`response_status`),
  CONSTRAINT `fk_coa_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_coa_nas` FOREIGN KEY (`nas_id`) REFERENCES `nas_devices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: assets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `assets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_name` VARCHAR(150) NOT NULL,
  `brand_model` VARCHAR(100) NULL,
  `category` ENUM('PerangkatAktif', 'Kabel', 'Aksesoris') NOT NULL,
  `serial_number` VARCHAR(100) NOT NULL,
  `mac_address` VARCHAR(17) NULL,
  `status` ENUM('Tersedia', 'Dipinjam', 'Terpasang', 'Rusak', 'DalamPengiriman', 'DibawaTeknisi') NOT NULL DEFAULT 'Tersedia',
  `branch_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NULL COMMENT 'When Terpasang',
  `assigned_teknisi_id` INT UNSIGNED NULL,
  `quantity` DECIMAL(10,2) NOT NULL DEFAULT 1.00 COMMENT 'meters for Kabel, pcs for Aksesoris',
  `remaining_quantity` DECIMAL(10,2) NOT NULL DEFAULT 1.00 COMMENT 'for partial usage tracking',
  `inbound_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assets_serial_number` (`serial_number`),
  INDEX `idx_assets_branch_id` (`branch_id`),
  INDEX `idx_assets_status` (`status`),
  INDEX `idx_assets_category` (`category`),
  INDEX `idx_assets_customer_id` (`customer_id`),
  INDEX `idx_assets_assigned_teknisi_id` (`assigned_teknisi_id`),
  CONSTRAINT `fk_assets_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assets_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assets_teknisi` FOREIGN KEY (`assigned_teknisi_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: asset_inbounds
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `asset_inbounds` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(50) NOT NULL,
  `purchase_date` DATE NOT NULL,
  `invoice_file_url` VARCHAR(500) NULL,
  `supplier_name` VARCHAR(150) NOT NULL,
  `branch_id` INT UNSIGNED NOT NULL,
  `recorded_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_asset_inbounds_branch_id` (`branch_id`),
  CONSTRAINT `fk_asset_inbounds_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_inbounds_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add FK for assets.inbound_id after asset_inbounds is created
ALTER TABLE `assets` ADD CONSTRAINT `fk_assets_inbound` FOREIGN KEY (`inbound_id`) REFERENCES `asset_inbounds` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Table: asset_transfers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `asset_transfers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_branch_id` INT UNSIGNED NOT NULL,
  `destination_branch_id` INT UNSIGNED NOT NULL,
  `type` ENUM('Transfer', 'Return') NOT NULL DEFAULT 'Transfer',
  `status` ENUM('Pending', 'InTransit', 'Received', 'Returned') NOT NULL DEFAULT 'Pending',
  `items` TEXT NOT NULL COMMENT 'JSON: list of asset IDs and SNs',
  `initiated_by` INT UNSIGNED NULL,
  `confirmed_by` INT UNSIGNED NULL,
  `initiated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_asset_transfers_source` (`source_branch_id`),
  INDEX `idx_asset_transfers_dest` (`destination_branch_id`),
  INDEX `idx_asset_transfers_status` (`status`),
  CONSTRAINT `fk_asset_transfers_source` FOREIGN KEY (`source_branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_transfers_dest` FOREIGN KEY (`destination_branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_transfers_initiated_by` FOREIGN KEY (`initiated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_transfers_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: tool_lendings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tool_lendings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id` INT UNSIGNED NOT NULL,
  `teknisi_id` INT UNSIGNED NOT NULL,
  `branch_id` INT UNSIGNED NOT NULL,
  `borrow_date` DATE NOT NULL,
  `expected_return_date` DATE NOT NULL,
  `actual_return_date` DATE NULL,
  `status` ENUM('Requested', 'Approved', 'Active', 'Returned', 'Lost') NOT NULL DEFAULT 'Requested',
  `condition_on_return` VARCHAR(255) NULL,
  `approved_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_tool_lendings_asset_id` (`asset_id`),
  INDEX `idx_tool_lendings_teknisi_id` (`teknisi_id`),
  INDEX `idx_tool_lendings_branch_id` (`branch_id`),
  INDEX `idx_tool_lendings_status` (`status`),
  CONSTRAINT `fk_tool_lendings_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_tool_lendings_teknisi` FOREIGN KEY (`teknisi_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_tool_lendings_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_tool_lendings_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: direct_sales
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `direct_sales` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `branch_id` INT UNSIGNED NOT NULL,
  `sold_by` INT UNSIGNED NULL,
  `payment_method` ENUM('Cash', 'Hutang') NOT NULL DEFAULT 'Cash',
  `total_amount` DECIMAL(12,2) NOT NULL,
  `items` TEXT NOT NULL COMMENT 'JSON: list of items with SN',
  `payment_status` ENUM('Lunas', 'Piutang') NOT NULL DEFAULT 'Lunas',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_direct_sales_customer_id` (`customer_id`),
  INDEX `idx_direct_sales_branch_id` (`branch_id`),
  INDEX `idx_direct_sales_payment_status` (`payment_status`),
  CONSTRAINT `fk_direct_sales_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_direct_sales_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_direct_sales_sold_by` FOREIGN KEY (`sold_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: stock_opnames
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stock_opnames` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` INT UNSIGNED NOT NULL,
  `conducted_by` INT UNSIGNED NULL,
  `status` ENUM('InProgress', 'Completed') NOT NULL DEFAULT 'InProgress',
  `adjustments` TEXT NULL COMMENT 'JSON: discrepancies and adjustments',
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_stock_opnames_branch_id` (`branch_id`),
  INDEX `idx_stock_opnames_status` (`status`),
  CONSTRAINT `fk_stock_opnames_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_stock_opnames_conducted_by` FOREIGN KEY (`conducted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: tickets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `subscription_id` INT UNSIGNED NULL,
  `issue_description` VARCHAR(500) NOT NULL,
  `source` ENUM('Pelanggan', 'Teknisi', 'Admin') NOT NULL,
  `priority` ENUM('VIP', 'High', 'Normal', 'Low') NOT NULL DEFAULT 'Normal',
  `status` ENUM('Open', 'InProgress', 'Pending', 'Resolved', 'Closed') NOT NULL DEFAULT 'Open',
  `assigned_teknisi_id` INT UNSIGNED NULL,
  `branch_id` INT UNSIGNED NOT NULL,
  `resolution_type` VARCHAR(50) NULL COMMENT 'RemoteFix, FieldFix',
  `damage_classification` VARCHAR(100) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL,
  `closed_at` TIMESTAMP NULL,
  `closed_by` INT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_tickets_customer_id` (`customer_id`),
  INDEX `idx_tickets_subscription_id` (`subscription_id`),
  INDEX `idx_tickets_branch_id` (`branch_id`),
  INDEX `idx_tickets_status` (`status`),
  INDEX `idx_tickets_priority` (`priority`),
  INDEX `idx_tickets_assigned_teknisi_id` (`assigned_teknisi_id`),
  CONSTRAINT `fk_tickets_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_teknisi` FOREIGN KEY (`assigned_teknisi_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: ticket_journals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ticket_journals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id` INT UNSIGNED NOT NULL,
  `teknisi_id` INT UNSIGNED NOT NULL,
  `description` TEXT NOT NULL,
  `photo_urls` TEXT NULL COMMENT 'JSON array',
  `progress_status` ENUM('Selesai', 'BelumSelesai', 'Progress') NOT NULL DEFAULT 'Progress',
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ticket_journals_ticket_id` (`ticket_id`),
  INDEX `idx_ticket_journals_teknisi_id` (`teknisi_id`),
  CONSTRAINT `fk_ticket_journals_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ticket_journals_teknisi` FOREIGN KEY (`teknisi_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: overtime_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `overtime_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id` INT UNSIGNED NOT NULL,
  `teknisi_id` INT UNSIGNED NOT NULL,
  `overtime_date` DATE NOT NULL,
  `approved_hours` DECIMAL(4,2) NULL,
  `status` ENUM('Requested', 'Approved', 'Rejected') NOT NULL DEFAULT 'Requested',
  `approved_by` INT UNSIGNED NULL,
  `compensation_amount` DECIMAL(12,2) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_overtime_ticket_id` (`ticket_id`),
  INDEX `idx_overtime_teknisi_id` (`teknisi_id`),
  INDEX `idx_overtime_status` (`status`),
  CONSTRAINT `fk_overtime_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_overtime_teknisi` FOREIGN KEY (`teknisi_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_overtime_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_whatsapp` VARCHAR(20) NOT NULL,
  `template_name` VARCHAR(100) NOT NULL,
  `parameters` TEXT NULL COMMENT 'JSON',
  `channel` ENUM('WhatsApp', 'Email', 'PushNotification') NOT NULL DEFAULT 'WhatsApp',
  `status` ENUM('Queued', 'Sent', 'Failed') NOT NULL DEFAULT 'Queued',
  `retry_count` INT NOT NULL DEFAULT 0,
  `failure_reason` VARCHAR(255) NULL,
  `related_entity_id` INT UNSIGNED NULL,
  `related_entity_type` VARCHAR(50) NULL,
  `queued_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_notifications_status` (`status`),
  INDEX `idx_notifications_channel` (`channel`),
  INDEX `idx_notifications_related` (`related_entity_type`, `related_entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: package_change_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `package_change_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subscription_id` INT UNSIGNED NOT NULL,
  `current_package_id` INT UNSIGNED NOT NULL,
  `requested_package_id` INT UNSIGNED NOT NULL,
  `requested_by` INT UNSIGNED NOT NULL,
  `status` ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  `rejection_reason` VARCHAR(255) NULL,
  `approved_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_pkg_change_subscription_id` (`subscription_id`),
  INDEX `idx_pkg_change_status` (`status`),
  CONSTRAINT `fk_pkg_change_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pkg_change_current_pkg` FOREIGN KEY (`current_package_id`) REFERENCES `packages` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pkg_change_requested_pkg` FOREIGN KEY (`requested_package_id`) REFERENCES `packages` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pkg_change_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pkg_change_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: capex_projects
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `capex_projects` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_name` VARCHAR(200) NOT NULL,
  `target_area` TEXT NOT NULL,
  `target_customer_count` INT NOT NULL DEFAULT 0,
  `materials_list` TEXT NULL COMMENT 'JSON',
  `calculated_rab` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('Draft', 'PendingApproval', 'Approved', 'Rejected', 'InProgress', 'Completed') NOT NULL DEFAULT 'Draft',
  `branch_id` INT UNSIGNED NOT NULL,
  `created_by` INT UNSIGNED NULL,
  `approved_by` INT UNSIGNED NULL,
  `revision_notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_capex_branch_id` (`branch_id`),
  INDEX `idx_capex_status` (`status`),
  CONSTRAINT `fk_capex_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_capex_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_capex_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: kpi_scores
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `kpi_scores` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `period` VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  `role_type` ENUM('Sales', 'Teknisi') NOT NULL,
  `target_value` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `actual_value` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `score_percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `reward_eligible` TINYINT(1) NOT NULL DEFAULT 0,
  `reward_amount` DECIMAL(12,2) NULL,
  `calculated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_kpi_user_id` (`user_id`),
  INDEX `idx_kpi_period` (`period`),
  INDEX `idx_kpi_role_type` (`role_type`),
  CONSTRAINT `fk_kpi_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: payroll_reports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payroll_reports` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `period` VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  `status` ENUM('Draft', 'PendingApproval', 'Approved', 'Revised') NOT NULL DEFAULT 'Draft',
  `summary` TEXT NULL COMMENT 'JSON: aggregated data',
  `approved_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_payroll_period` (`period`),
  INDEX `idx_payroll_status` (`status`),
  CONSTRAINT `fk_payroll_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: fup_usage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fup_usage` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subscription_id` INT UNSIGNED NOT NULL,
  `billing_period` VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  `bytes_used` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `threshold_exceeded` TINYINT(1) NOT NULL DEFAULT 0,
  `exceeded_at` TIMESTAMP NULL,
  `reset_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_fup_subscription_id` (`subscription_id`),
  INDEX `idx_fup_billing_period` (`billing_period`),
  UNIQUE KEY `uk_fup_subscription_period` (`subscription_id`, `billing_period`),
  CONSTRAINT `fk_fup_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: job_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_name` VARCHAR(100) NOT NULL,
  `start_time` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_time` TIMESTAMP NULL,
  `records_processed` INT NOT NULL DEFAULT 0,
  `records_failed` INT NOT NULL DEFAULT 0,
  `status` ENUM('Running', 'Success', 'Partial', 'Failed') NOT NULL DEFAULT 'Running',
  `error_details` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_job_logs_job_name` (`job_name`),
  INDEX `idx_job_logs_status` (`status`),
  INDEX `idx_job_logs_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: down_payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `down_payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `payment_date` DATE NOT NULL,
  `received_by` INT UNSIGNED NULL,
  `applied` TINYINT(1) NOT NULL DEFAULT 0,
  `applied_to_invoice_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_dp_customer_id` (`customer_id`),
  INDEX `idx_dp_applied` (`applied`),
  CONSTRAINT `fk_dp_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_dp_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_dp_invoice` FOREIGN KEY (`applied_to_invoice_id`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: work_journals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `work_journals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `teknisi_id` INT UNSIGNED NOT NULL,
  `ticket_id` INT UNSIGNED NULL,
  `journal_date` DATE NOT NULL,
  `activity_description` TEXT NOT NULL,
  `photo_urls` TEXT NULL COMMENT 'JSON array',
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_work_journals_teknisi_id` (`teknisi_id`),
  INDEX `idx_work_journals_ticket_id` (`ticket_id`),
  INDEX `idx_work_journals_journal_date` (`journal_date`),
  CONSTRAINT `fk_work_journals_teknisi` FOREIGN KEY (`teknisi_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_work_journals_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: system_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NULL,
  `description` VARCHAR(255) NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_system_settings_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: auth_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auth_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL,
  `username` VARCHAR(50) NOT NULL,
  `event_type` ENUM('LoginSuccess', 'LoginFailed', 'TokenRefresh', 'PasswordReset') NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_auth_logs_user_id` (`user_id`),
  INDEX `idx_auth_logs_event_type` (`event_type`),
  INDEX `idx_auth_logs_created_at` (`created_at`),
  CONSTRAINT `fk_auth_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Re-enable foreign key checks
-- ============================================================================
SET FOREIGN_KEY_CHECKS = 1;
