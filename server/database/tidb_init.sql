-- TiDB Cloud initialization bundle for a NEW, EMPTY database only.
-- Do not run this against an existing database or a database imported from XAMPP.
-- For existing business data, import a full backup to a separate empty test database,
-- compare the schema, then apply only migrations confirmed to be missing.
-- Generated from schema.sql, 007, 009, and 010 in that order.
-- Migration 008 columns are already present in schema.sql and are not repeated here.
-- Review compatibility and verify on a disposable TiDB database before production.

-- ===== BEGIN server/database/schema.sql =====
-- ==========================================================
-- SAW MILL MANAGEMENT SYSTEM - DATABASE INITIALIZATION SCHEMA
-- Engine: MySQL 8.x / MariaDB
-- Select the target database in the mysql client before importing this file.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. ROLES, PERMISSIONS & USERS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(80) NOT NULL UNIQUE,
  `module` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_id` INT UNSIGNED NOT NULL,
  `status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  `phone` VARCHAR(30) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
  INDEX `idx_users_role_id` (`role_id`),
  INDEX `idx_users_status` (`status`),
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Standard Roles
INSERT INTO `roles` (`name`, `description`) VALUES
('admin', 'Super Administrator with unrestricted access'),
('manager', 'Yard Manager and Quality Supervisor'),
('operator', 'Machine and Sawing Operator'),
('accountant', 'Financial and Billing Officer')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- Seed Standard Permissions
INSERT INTO `permissions` (`name`, `module`, `description`) VALUES
('manage_users', 'users', 'Create and modify user accounts and roles'),
('view_inventory', 'inventory', 'View timber batches and stock levels'),
('manage_inventory', 'inventory', 'Add and edit raw logs and sawn batches'),
('manage_purchases', 'purchases', 'Manage supplier timber procurement orders'),
('manage_cutting_jobs', 'production', 'Dispatch and manage sawing cut orders'),
('manage_sales_orders', 'sales', 'Create, confirm, fulfill and cancel wholesale sales orders'),
('manage_invoices', 'billing', 'Generate invoices and record payments'),
('view_reports', 'analytics', 'Access executive summaries and recovery yield')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- Link Admin to all permissions
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'admin';

INSERT INTO `permissions` (`name`, `module`, `description`) VALUES
('view_expenses', 'expenses', 'View expenses and expense reports'),
('manage_expenses', 'expenses', 'Create and edit expenses and categories'),
('reverse_expenses', 'expenses', 'Reverse posted expenses with a reason'),
('view_employees', 'employees', 'View employee records'),
('manage_employees', 'employees', 'Create and update employee records'),
('view_employee_salary', 'employees', 'View employee salary information'),
('manage_employee_salary', 'employees', 'Create and update employee salary information'),
('view_enquiries', 'enquiries', 'View, assign, and update public customer enquiries'),
('manage_enquiries', 'enquiries', 'Manage and convert customer enquiries'),
('view_deliveries', 'deliveries', 'View delivery records and history'),
('manage_deliveries', 'deliveries', 'Schedule and update deliveries')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN (
  'view_expenses', 'manage_expenses', 'reverse_expenses',
  'view_employees', 'manage_employees', 'view_employee_salary',
  'manage_employee_salary', 'view_enquiries', 'manage_enquiries',
  'view_deliveries', 'manage_deliveries'
)
WHERE r.name = 'admin';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN (
  'view_expenses', 'manage_expenses', 'view_employees',
  'manage_employees', 'view_employee_salary', 'view_enquiries',
  'manage_enquiries', 'view_deliveries', 'manage_deliveries', 'view_reports'
)
WHERE r.name = 'accountant';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN (
  'view_expenses', 'view_employees', 'manage_employees',
  'view_enquiries', 'manage_enquiries', 'view_deliveries', 'view_reports'
)
WHERE r.name = 'manager';

-- ----------------------------------------------------------
-- 2. CUSTOMERS / CLIENTS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `contact_person` VARCHAR(120) NULL,
  `company_name` VARCHAR(150) NULL,
  `email` VARCHAR(150) NULL,
  `phone` VARCHAR(30) NOT NULL,
  `type` VARCHAR(50) DEFAULT 'Commercial Contractor',
  `address` TEXT NULL,
  `city` VARCHAR(100) NULL,
  `tax_gst_number` VARCHAR(50) NULL,
  `credit_limit` DECIMAL(12, 2) DEFAULT 50000.00,
  `payment_terms` VARCHAR(50) DEFAULT 'Net 30',
  `status` ENUM('Active', 'Inactive', 'Suspended') DEFAULT 'Active',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_customers_name` (`name`),
  INDEX `idx_customers_phone` (`phone`),
  INDEX `idx_customers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 2B. SUPPLIERS (FORESTRY & LOG VENDORS)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `company_name` VARCHAR(150) NOT NULL,
  `rep_name` VARCHAR(120) NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) NULL,
  `region` VARCHAR(100) DEFAULT 'Pacific Northwest',
  `specialty` VARCHAR(255) DEFAULT 'Douglas Fir, Western Red Cedar',
  `payment_terms` VARCHAR(50) DEFAULT 'Net 30 Days',
  `status` ENUM('Active', 'Preferred', 'Inactive') DEFAULT 'Active',
  `rating` DECIMAL(2, 1) DEFAULT 4.5,
  `address` TEXT NULL,
  `tax_id` VARCHAR(50) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_suppliers_company` (`company_name`),
  INDEX `idx_suppliers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 2C. PURCHASES & PURCHASE ITEMS (TIMBER PROCUREMENT)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `purchases` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `purchase_number` VARCHAR(60) NOT NULL UNIQUE,
  `supplier_id` INT UNSIGNED NOT NULL,
  `status` ENUM('draft', 'ordered', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  `payment_status` ENUM('pending', 'partially_paid', 'paid') NOT NULL DEFAULT 'pending',
  `payment_method` VARCHAR(50) DEFAULT 'Bank Wire Transfer',
  `expected_delivery_date` DATE NULL,
  `actual_delivery_date` DATE NULL,
  `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `total_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `paid_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `invoice_ref` VARCHAR(100) NULL,
  `received_by_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`received_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_purchases_supplier` (`supplier_id`),
  INDEX `idx_purchases_status` (`status`),
  INDEX `idx_purchases_number` (`purchase_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `purchase_items` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `purchase_id` INT UNSIGNED NOT NULL,
  `timber_type` ENUM('raw_log', 'sawn_timber') NOT NULL DEFAULT 'raw_log',
  `species` VARCHAR(100) NOT NULL,
  `grade` VARCHAR(50) DEFAULT 'Grade A',
  `dimensions_text` VARCHAR(100) NULL,
  `length_feet` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `width_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `thickness_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `girth_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `pieces_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `volume_cbf` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `unit_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `total_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `generated_batch_id` INT UNSIGNED NULL,
  `received_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE,
  INDEX `idx_pi_purchase` (`purchase_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 2D. PAYMENTS (LEDGER FOR CUSTOMER & SUPPLIER SETTLEMENTS)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `payment_number` VARCHAR(60) NOT NULL UNIQUE,
  `type` ENUM('customer_payment', 'supplier_payment') NOT NULL,
  `customer_id` INT UNSIGNED NULL,
  `supplier_id` INT UNSIGNED NULL,
  `invoice_id` INT UNSIGNED NULL,
  `purchase_id` INT UNSIGNED NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `payment_method` VARCHAR(50) DEFAULT 'Bank Wire Transfer',
  `payment_date` DATE NOT NULL,
  `reference_notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL,
  INDEX `idx_payments_customer` (`customer_id`),
  INDEX `idx_payments_supplier` (`supplier_id`),
  INDEX `idx_payments_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 3. TIMBER BATCHES (RAW LOGS & SAWN TIMBER INVENTORY)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `timber_batches` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `batch_code` VARCHAR(60) NOT NULL UNIQUE,
  `name` VARCHAR(150) NOT NULL,
  `timber_type` ENUM('raw_log', 'sawn_timber') NOT NULL DEFAULT 'sawn_timber',
  `category` VARCHAR(60) NOT NULL DEFAULT 'Dimensional Lumber', -- 'Round Logs', 'Dimensional Lumber', 'Structural Beams', 'Live Edge Slabs', etc.
  `species` VARCHAR(100) NOT NULL,
  `grade` VARCHAR(50) DEFAULT 'Select & Better',
  `dimensions_text` VARCHAR(100) NULL,
  `length_feet` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `width_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `thickness_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `girth_inches` DECIMAL(8, 2) NULL DEFAULT 0.00, -- for raw round logs
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT', -- 'CFT', 'Board Feet', 'Pieces', 'Sq Ft', 'Meters'
  `pieces_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `calculated_volume_cbf` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `calculated_board_feet` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_total` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_available` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_reserved` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_consumed` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `ownership` ENUM('mill', 'customer') NOT NULL DEFAULT 'mill',
  `customer_id` INT UNSIGNED NULL,
  `status` ENUM('In Stock', 'Low Stock', 'Reserved', 'Consumed', 'Quarantine') NOT NULL DEFAULT 'In Stock',
  `yard_location` VARCHAR(100) DEFAULT 'Yard Bay A-1',
  `moisture_percent` DECIMAL(5, 2) DEFAULT 12.00,
  `min_stock_threshold` DECIMAL(12, 3) DEFAULT 50.000,
  `cost_price` DECIMAL(12, 2) DEFAULT 0.00,
  `selling_price` DECIMAL(12, 2) DEFAULT 0.00,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  INDEX `idx_tb_batch_code` (`batch_code`),
  INDEX `idx_tb_timber_type` (`timber_type`),
  INDEX `idx_tb_category` (`category`),
  INDEX `idx_tb_species` (`species`),
  INDEX `idx_tb_status` (`status`),
  INDEX `idx_tb_ownership` (`ownership`),
  INDEX `idx_tb_fifo_layers` (`ownership`, `timber_type`, `species`, `unit`, `created_at`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 4. STOCK MOVEMENTS (IMMUTABLE LEDGER)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `batch_id` INT UNSIGNED NOT NULL,
  `movement_type` ENUM('receipt', 'issue', 'adjustment_add', 'adjustment_deduct', 'reservation', 'release', 'consumption') NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `previous_quantity` DECIMAL(12, 3) NOT NULL,
  `new_quantity` DECIMAL(12, 3) NOT NULL,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `source_transaction_type` VARCHAR(60) NOT NULL, -- 'initial_intake', 'purchase', 'sales_order', 'cutting_job', 'manual_adjustment'
  `source_transaction_id` VARCHAR(60) NULL,
  `reason` TEXT NOT NULL,
  `authorized_by_id` INT UNSIGNED NULL,
  `allow_negative` BOOLEAN NOT NULL DEFAULT FALSE,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`batch_id`) REFERENCES `timber_batches`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`authorized_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_sm_batch` (`batch_id`),
  INDEX `idx_sm_type` (`movement_type`),
  INDEX `idx_sm_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 5. CUTTING JOBS / SAWING ORDERS & INPUT/OUTPUT TRACKING
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cutting_jobs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `job_number` VARCHAR(60) NOT NULL UNIQUE,
  `job_title` VARCHAR(150) NOT NULL,
  `job_type` ENUM('customer_order', 'internal_production') NOT NULL DEFAULT 'customer_order',
  `customer_id` INT UNSIGNED NULL,
  `saw_line` VARCHAR(100) DEFAULT 'Line 1 (60" Band Saw)',
  `operator_name` VARCHAR(100) NULL,
  `priority` ENUM('Low', 'Normal', 'High', 'Urgent') DEFAULT 'Normal',
  `requested_dimensions` VARCHAR(150) NOT NULL,
  `kerf_allowance` VARCHAR(50) DEFAULT '0.125"',
  `status` ENUM('draft', 'scheduled', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  `input_total_volume` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `output_total_volume` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `waste_volume` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `recovery_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  `rate_per_cbf` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `labour_charges` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_charges` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `ownership` ENUM('mill', 'customer') NOT NULL DEFAULT 'mill',
  `start_date` DATE NULL,
  `completion_date` DATE NULL,
  `due_date` DATE NULL,
  `notes` TEXT NULL,
  `created_by_id` INT UNSIGNED NULL,
  `completed_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_cj_job_number` (`job_number`),
  INDEX `idx_cj_status` (`status`),
  INDEX `idx_cj_customer` (`customer_id`),
  INDEX `idx_cj_ownership` (`ownership`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cutting_job_inputs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `cutting_job_id` INT UNSIGNED NOT NULL,
  `batch_id` INT UNSIGNED NOT NULL,
  `quantity_used` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cutting_job_id`) REFERENCES `cutting_jobs`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`batch_id`) REFERENCES `timber_batches`(`id`) ON DELETE RESTRICT,
  INDEX `idx_cji_job` (`cutting_job_id`),
  INDEX `idx_cji_batch` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cutting_job_outputs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `cutting_job_id` INT UNSIGNED NOT NULL,
  `generated_batch_id` INT UNSIGNED NULL,
  `product_name` VARCHAR(150) NOT NULL,
  `species` VARCHAR(100) NOT NULL,
  `dimensions_text` VARCHAR(100) NOT NULL,
  `thickness_inches` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `width_inches` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `length_feet` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `pieces_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `volume_cbf` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `grade` VARCHAR(50) DEFAULT 'Select Structural',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cutting_job_id`) REFERENCES `cutting_jobs`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`generated_batch_id`) REFERENCES `timber_batches`(`id`) ON DELETE SET NULL,
  INDEX `idx_cjo_job` (`cutting_job_id`),
  INDEX `idx_cjo_batch` (`generated_batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sawing_jobs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `job_number` VARCHAR(50) NOT NULL UNIQUE,
  `customer_id` INT UNSIGNED NOT NULL,
  `raw_log_id` INT UNSIGNED NULL,
  `service_type` ENUM('custom_milling', 'lumber_purchase', 'planing_seasoning') NOT NULL DEFAULT 'custom_milling',
  `target_specifications` TEXT NOT NULL,
  `status` ENUM('pending', 'in_progress', 'completed', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  `estimated_volume_cbf` DECIMAL(10, 3) DEFAULT 0.000,
  `rate_per_cbf` DECIMAL(10, 2) DEFAULT 0.00,
  `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `start_date` DATE NULL,
  `completion_date` DATE NULL,
  `assigned_operator` VARCHAR(100) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`raw_log_id`) REFERENCES `timber_batches`(`id`) ON DELETE SET NULL,
  INDEX `idx_sawing_jobs_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 5B. SALES ORDERS & FULFILLMENT
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sales_orders` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(60) NOT NULL UNIQUE,
  `customer_id` INT UNSIGNED NOT NULL,
  `status` ENUM('draft', 'confirmed', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  `payment_status` ENUM('unpaid', 'partially_paid', 'paid') NOT NULL DEFAULT 'unpaid',
  `order_date` DATE NOT NULL,
  `delivery_date` DATE NULL,
  `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `shipping_charges` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `cancellation_reason` TEXT NULL,
  `notes` TEXT NULL,
  `created_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_so_customer` (`customer_id`),
  INDEX `idx_so_status` (`status`),
  INDEX `idx_so_order_number` (`order_number`),
  INDEX `idx_so_order_date` (`order_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sales_order_items` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sales_order_id` INT UNSIGNED NOT NULL,
  `batch_id` INT UNSIGNED NULL,
  `product_name` VARCHAR(150) NOT NULL,
  `species` VARCHAR(100) NOT NULL,
  `dimensions_text` VARCHAR(100) NULL,
  `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 1.000,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `unit_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `discount_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `tax_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `unit_cost_at_fulfillment` DECIMAL(12, 2) NULL,
  `total_cost_at_fulfillment` DECIMAL(14, 2) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`batch_id`) REFERENCES `timber_batches`(`id`) ON DELETE RESTRICT,
  INDEX `idx_soi_order` (`sales_order_id`),
  INDEX `idx_soi_batch` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sales_order_history` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `sales_order_id` INT UNSIGNED NOT NULL,
  `from_status` VARCHAR(50) NULL,
  `to_status` VARCHAR(50) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `changed_by_id` INT UNSIGNED NULL,
  `reason` TEXT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_soh_order` (`sales_order_id`),
  INDEX `idx_soh_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 6. INVOICES, LINE ITEMS & PAYMENTS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `billing_sequences` (
  `sequence_name` VARCHAR(32) NOT NULL PRIMARY KEY,
  `last_value` BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `invoice_number` VARCHAR(60) NOT NULL UNIQUE,
  -- Source links (exactly one should be set, or neither for standalone)
  `sales_order_id` INT UNSIGNED NULL,
  `cutting_job_id` INT UNSIGNED NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  -- Financials (authoritative backend-calculated values only)
  `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `taxable_value` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0000,  -- stored as fraction e.g. 0.1800 = 18%
  `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `additional_charges` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `cutting_charge` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `grand_total` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `amount_due` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,  -- maintained = grand_total - amount_paid
  -- Status (maintained through controlled transitions only)
  `payment_status` ENUM('unpaid', 'partially_paid', 'paid', 'voided') NOT NULL DEFAULT 'unpaid',
  -- Dates
  `issue_date` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  -- Metadata
  `currency` VARCHAR(3) NOT NULL DEFAULT 'INR',
  `language_code` VARCHAR(10) NOT NULL DEFAULT 'en',
  `payment_terms` VARCHAR(100) DEFAULT 'Net 30',
  `notes` TEXT NULL,
  `created_by_id` INT UNSIGNED NULL,
  `voided_by_id` INT UNSIGNED NULL,
  `voided_at` TIMESTAMP NULL,
  `void_reason` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`cutting_job_id`) REFERENCES `cutting_jobs`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`voided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_inv_number` (`invoice_number`),
  INDEX `idx_inv_customer` (`customer_id`),
  INDEX `idx_inv_status` (`payment_status`),
  INDEX `idx_inv_issue_date` (`issue_date`),
  INDEX `idx_inv_due_date` (`due_date`),
  INDEX `idx_inv_sales_order` (`sales_order_id`),
  INDEX `idx_inv_cutting_job` (`cutting_job_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` INT UNSIGNED NOT NULL,
  `wood_type_id` INT UNSIGNED NULL,
  `description` VARCHAR(255) NOT NULL,
  `localized_description` VARCHAR(255) NULL,
  `dimensions_text` VARCHAR(255) NULL,
  `quantity` DECIMAL(14, 3) NOT NULL DEFAULT 1.000,
  `unit` VARCHAR(30) NOT NULL DEFAULT 'CFT',
  `unit_price` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `discount_percent` DECIMAL(6, 4) NOT NULL DEFAULT 0.0000,
  `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `tax_percent` DECIMAL(6, 4) NOT NULL DEFAULT 0.0000,
  `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE,
  INDEX `idx_ii_invoice` (`invoice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_payments` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `payment_number` VARCHAR(60) NOT NULL UNIQUE,
  `invoice_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL,            -- positive = receipt from customer
  `payment_method` ENUM('cash','bank_transfer','upi','cheque','credit_card','other') NOT NULL DEFAULT 'bank_transfer',
  `payment_date` DATE NOT NULL,
  `transaction_reference` VARCHAR(150) NULL,    -- bank UTR, cheque number, UPI ID, etc.
  `idempotency_key` VARCHAR(100) NULL UNIQUE,
  `balance_after` DECIMAL(14, 2) NULL,
  `notes` TEXT NULL,
  `status` ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
  -- Reversal fields
  `reversed_by_payment_id` INT UNSIGNED NULL,   -- points to the reversing payment row
  `reversal_reason` TEXT NULL,
  `reversed_at` TIMESTAMP NULL,
  `recorded_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_cp_invoice` (`invoice_id`),
  INDEX `idx_cp_customer` (`customer_id`),
  INDEX `idx_cp_status` (`status`),
  INDEX `idx_cp_payment_number` (`payment_number`),
  INDEX `idx_cp_date` (`payment_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 7. PUBLIC QUOTE REQUESTS & INQUIRIES
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quote_requests` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `client_name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `wood_species` VARCHAR(100) NOT NULL,
  `estimated_volume` VARCHAR(100) NULL,
  `service_required` VARCHAR(100) DEFAULT 'Custom Timber Sawing',
  `message` TEXT NOT NULL,
  `status` ENUM('new', 'reviewed', 'contacted', 'closed') NOT NULL DEFAULT 'new',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 8. REFRESH TOKENS (SESSION & TOKEN REVOCATION)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hex of the refresh JWT
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_rt_user` (`user_id`),
  INDEX `idx_rt_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 9. AUDIT LOGS (SECURITY & ADMINISTRATIVE AUDIT TRAIL)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NULL,
  `action` VARCHAR(100) NOT NULL,
  `table_name` VARCHAR(80) NULL,
  `record_id` INT UNSIGNED NULL,
  `description` TEXT NULL,
  `ip_address` VARCHAR(45) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_action` (`action`),
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 10. EXPENSES & EMPLOYEE RECORDS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(80) NOT NULL UNIQUE,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `expense_categories` (`name`) VALUES
('Electricity'), ('Labour'), ('Transport'), ('Maintenance'), ('Other')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

CREATE TABLE IF NOT EXISTS `expenses` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT UNSIGNED NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `vendor` VARCHAR(160) NULL,
  `expense_date` DATE NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `status` ENUM('posted', 'reversed') NOT NULL DEFAULT 'posted',
  `reversal_reason` VARCHAR(500) NULL,
  `created_by_id` INT UNSIGNED NULL,
  `updated_by_id` INT UNSIGNED NULL,
  `reversed_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `reversed_at` DATETIME NULL,
  FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`),
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`reversed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_expenses_date` (`expense_date`),
  INDEX `idx_expenses_category_date` (`category_id`, `expense_date`),
  INDEX `idx_expenses_status_date` (`status`, `expense_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employees` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(150) NULL,
  `job_title` VARCHAR(120) NOT NULL,
  `joining_date` DATE NOT NULL,
  `salary` DECIMAL(12, 2) NULL,
  `salary_period` ENUM('hourly', 'monthly', 'annual') NULL,
  `created_by_id` INT UNSIGNED NULL,
  `updated_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_employees_name` (`name`),
  INDEX `idx_employees_joining_date` (`joining_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `deliveries` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `delivery_number` VARCHAR(60) NOT NULL UNIQUE,
  `sales_order_id` INT UNSIGNED NOT NULL UNIQUE,
  `status` ENUM('scheduled', 'dispatched', 'delivered', 'failed') NOT NULL DEFAULT 'scheduled',
  `planned_delivery_date` DATE NOT NULL,
  `vehicle_info` VARCHAR(160) NULL,
  `driver_name` VARCHAR(120) NULL,
  `transport_notes` TEXT NULL,
  `delivery_confirmation_name` VARCHAR(120) NULL,
  `delivery_confirmation_notes` TEXT NULL,
  `delivered_at` DATETIME NULL,
  `failure_reason` VARCHAR(500) NULL,
  `created_by_id` INT UNSIGNED NULL,
  `updated_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_deliveries_status_date` (`status`, `planned_delivery_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `delivery_history` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `delivery_id` INT UNSIGNED NOT NULL,
  `from_status` VARCHAR(30) NULL,
  `to_status` VARCHAR(30) NOT NULL,
  `action` VARCHAR(60) NOT NULL,
  `changed_by_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_delivery_history_delivery` (`delivery_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_enquiries` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `reference` VARCHAR(40) NOT NULL UNIQUE,
  `source` ENUM('quote', 'contact') NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(150) NULL,
  `requested_product` VARCHAR(150) NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `quantity_unit` VARCHAR(40) NOT NULL,
  `service_required` VARCHAR(120) NULL,
  `dimensions` VARCHAR(255) NULL,
  `preferred_delivery_date` DATE NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('new', 'qualified', 'in_progress', 'converted', 'closed') NOT NULL DEFAULT 'new',
  `assigned_to_id` INT UNSIGNED NULL,
  `internal_notes` TEXT NULL,
  `customer_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  INDEX `idx_enquiries_status_created` (`status`, `created_at`),
  INDEX `idx_enquiries_email` (`email`),
  INDEX `idx_enquiries_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `enquiry_history` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `enquiry_id` INT UNSIGNED NOT NULL,
  `from_status` VARCHAR(30) NULL,
  `to_status` VARCHAR(30) NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `changed_by_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`enquiry_id`) REFERENCES `customer_enquiries`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_enquiry_history_enquiry` (`enquiry_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `enquiry_quotations` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `quotation_number` VARCHAR(60) NOT NULL UNIQUE,
  `enquiry_id` INT UNSIGNED NOT NULL UNIQUE,
  `customer_id` INT UNSIGNED NOT NULL,
  `requested_product` VARCHAR(150) NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `quantity_unit` VARCHAR(40) NOT NULL,
  `service_required` VARCHAR(120) NULL,
  `dimensions` VARCHAR(255) NULL,
  `status` ENUM('draft', 'issued', 'accepted', 'declined', 'expired') NOT NULL DEFAULT 'draft',
  `created_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`enquiry_id`) REFERENCES `customer_enquiries`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reporting_settings` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `inventory_costing_method` ENUM('fifo') NOT NULL DEFAULT 'fifo',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_reporting_settings_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `reporting_settings` (`id`, `inventory_costing_method`)
VALUES (1, 'fifo')
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);

-- ===== END server/database/schema.sql =====

-- ===== BEGIN server/database/007_wood_type_catalogue.sql =====
-- Before applying: back up the database and check for partially created catalogue
-- tables/columns. Run once only; MySQL DDL auto-commits and the ALTER statements
-- are not safe to rerun after a partial application. Do not run at server startup.
-- This migration is additive: the existing species text and stock records remain.

CREATE TABLE IF NOT EXISTS `wood_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(100) NOT NULL,
  `common_name_en` VARCHAR(150) NOT NULL,
  `scientific_name` VARCHAR(200) NULL,
  `scientific_name_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `common_name_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `image_url` VARCHAR(500) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_wood_types_slug` (`slug`),
  INDEX `idx_wood_types_common_name` (`common_name_en`),
  INDEX `idx_wood_types_scientific_name` (`scientific_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wood_names` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `wood_type_id` INT UNSIGNED NOT NULL,
  `language_code` VARCHAR(10) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `name_kind` ENUM('preferred', 'alias') NOT NULL DEFAULT 'preferred',
  `verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_wood_names_type_language_name` (`wood_type_id`, `language_code`, `name`),
  INDEX `idx_wood_names_language_name` (`language_code`, `name`),
  CONSTRAINT `fk_wood_names_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `timber_batches`
  ADD COLUMN `wood_type_id` INT UNSIGNED NULL AFTER `species`,
  ADD COLUMN `image_url` VARCHAR(500) NULL AFTER `selling_price`,
  ADD INDEX `idx_tb_wood_type_id` (`wood_type_id`),
  ADD CONSTRAINT `fk_tb_wood_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE SET NULL;

ALTER TABLE `purchase_items`
  ADD COLUMN `wood_type_id` INT UNSIGNED NULL AFTER `species`,
  ADD INDEX `idx_pi_wood_type_id` (`wood_type_id`),
  ADD CONSTRAINT `fk_pi_wood_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE SET NULL;

-- Catalog seeds are keyed by stable slugs and do not replace existing edits.
INSERT IGNORE INTO `wood_types`
  (`slug`, `common_name_en`, `scientific_name`, `scientific_name_verified`)
VALUES
  ('teak', 'Teak', 'Tectona grandis', TRUE),
  ('neem', 'Neem', 'Azadirachta indica', TRUE),
  ('sandalwood', 'Sandalwood', 'Santalum album', TRUE),
  ('eucalyptus', 'Eucalyptus', NULL, FALSE),
  ('mango', 'Mango', 'Mangifera indica', TRUE),
  ('jackfruit', 'Jackfruit', 'Artocarpus heterophyllus', TRUE),
  ('bamboo', 'Bamboo', NULL, FALSE),
  ('rosewood', 'Rosewood', NULL, FALSE),
  ('indian-rosewood', 'Indian Rosewood', 'Dalbergia latifolia', TRUE),
  ('shisham', 'Shisham', 'Dalbergia sissoo', TRUE),
  ('sal', 'Sal', 'Shorea robusta', TRUE),
  ('deodar', 'Deodar', 'Cedrus deodara', TRUE),
  ('pine', 'Pine', NULL, FALSE),
  ('acacia', 'Acacia', NULL, FALSE),
  ('casuarina', 'Casuarina', NULL, FALSE),
  ('mahogany', 'Mahogany', NULL, FALSE),
  ('silver-oak', 'Silver Oak', 'Grevillea robusta', TRUE),
  ('tamarind', 'Tamarind', 'Tamarindus indica', TRUE),
  ('arjun', 'Arjun', 'Terminalia arjuna', TRUE),
  ('honge-indian-beech', 'Honge / Indian Beech', NULL, FALSE);

-- Names supplied for Kannada, Hindi, Telugu, and Tamil. They remain unverified
-- until reviewed by a fluent speaker; overlapping names are not aliases between species.
INSERT IGNORE INTO `wood_names` (`wood_type_id`, `language_code`, `name`, `name_kind`, `verified`)
SELECT wt.id, names.language_code, names.name, 'preferred', FALSE
FROM (
  SELECT 'teak' slug, 'kn' language_code, 'ತೇಗ' name UNION ALL
  SELECT 'teak', 'hi', 'सागौन' UNION ALL SELECT 'teak', 'te', 'టేకు' UNION ALL SELECT 'teak', 'ta', 'தேக்கு' UNION ALL
  SELECT 'neem', 'kn', 'ಬೇವು' UNION ALL SELECT 'neem', 'hi', 'नीम' UNION ALL SELECT 'neem', 'te', 'వేప' UNION ALL SELECT 'neem', 'ta', 'வேம்பு' UNION ALL
  SELECT 'sandalwood', 'kn', 'ಶ್ರೀಗಂಧ' UNION ALL SELECT 'sandalwood', 'hi', 'चंदन' UNION ALL SELECT 'sandalwood', 'te', 'చందనం' UNION ALL SELECT 'sandalwood', 'ta', 'சந்தனம்' UNION ALL
  SELECT 'eucalyptus', 'kn', 'ನೀಲಗಿರಿ' UNION ALL SELECT 'eucalyptus', 'hi', 'नीलगिरी' UNION ALL SELECT 'eucalyptus', 'te', 'యూకలిప్టస్' UNION ALL SELECT 'eucalyptus', 'ta', 'யூகலிப்டஸ்' UNION ALL
  SELECT 'mango', 'kn', 'ಮಾವು' UNION ALL SELECT 'mango', 'hi', 'आम' UNION ALL SELECT 'mango', 'te', 'మామిడి' UNION ALL SELECT 'mango', 'ta', 'மாமரம்' UNION ALL
  SELECT 'jackfruit', 'kn', 'ಹಲಸು' UNION ALL SELECT 'jackfruit', 'hi', 'कटहल' UNION ALL SELECT 'jackfruit', 'te', 'పనస' UNION ALL SELECT 'jackfruit', 'ta', 'பலா' UNION ALL
  SELECT 'bamboo', 'kn', 'ಬಿದಿರು' UNION ALL SELECT 'bamboo', 'hi', 'बाँस' UNION ALL SELECT 'bamboo', 'te', 'వెదురు' UNION ALL SELECT 'bamboo', 'ta', 'மூங்கில்' UNION ALL
  SELECT 'rosewood', 'kn', 'ಬೀಟೆ*' UNION ALL SELECT 'rosewood', 'hi', 'शीशम*' UNION ALL SELECT 'rosewood', 'te', 'రోజ్‌వుడ్*' UNION ALL SELECT 'rosewood', 'ta', 'ஈட்டி*'
) AS names
JOIN `wood_types` wt ON wt.slug = names.slug;

-- Preserve old text values and only link exact English common-name matches.
UPDATE `timber_batches` tb
JOIN `wood_types` wt ON LOWER(TRIM(tb.species)) = LOWER(wt.common_name_en)
SET tb.wood_type_id = wt.id
WHERE tb.wood_type_id IS NULL
  AND (SELECT COUNT(*) FROM `wood_types` match_count
       WHERE LOWER(TRIM(match_count.common_name_en)) = LOWER(TRIM(tb.species))) = 1;

UPDATE `purchase_items` pi
JOIN `wood_types` wt ON LOWER(TRIM(pi.species)) = LOWER(wt.common_name_en)
SET pi.wood_type_id = wt.id
WHERE pi.wood_type_id IS NULL
  AND (SELECT COUNT(*) FROM `wood_types` match_count
       WHERE LOWER(TRIM(match_count.common_name_en)) = LOWER(TRIM(pi.species))) = 1;

-- ===== END server/database/007_wood_type_catalogue.sql =====

-- ===== BEGIN server/database/009_additional_regional_wood_names.sql =====
-- Add regional names for the remaining familiar Indian timber types.
-- Names are intentionally unverified until reviewed by fluent speakers.
-- Apply after 007_wood_type_catalogue.sql; this migration is safe to rerun.

INSERT IGNORE INTO `wood_names` (`wood_type_id`, `language_code`, `name`, `name_kind`, `verified`)
SELECT wt.id, names.language_code, names.name, 'preferred', FALSE
FROM (
  SELECT 'shisham' slug, 'kn' language_code, 'ಶೀಶಂ' name UNION ALL
  SELECT 'shisham', 'hi', 'शीशम' UNION ALL SELECT 'shisham', 'te', 'శీశం' UNION ALL SELECT 'shisham', 'ta', 'ஷீஷம்' UNION ALL
  SELECT 'sal', 'kn', 'ಸಾಲ್' UNION ALL SELECT 'sal', 'hi', 'साल' UNION ALL SELECT 'sal', 'te', 'సాల్' UNION ALL SELECT 'sal', 'ta', 'சால்' UNION ALL
  SELECT 'deodar', 'kn', 'ದೇವದಾರು' UNION ALL SELECT 'deodar', 'hi', 'देवदार' UNION ALL SELECT 'deodar', 'te', 'దేవదారు' UNION ALL SELECT 'deodar', 'ta', 'தேவதாரு' UNION ALL
  SELECT 'pine', 'kn', 'ಪೈನ್' UNION ALL SELECT 'pine', 'hi', 'चीड़' UNION ALL SELECT 'pine', 'te', 'పైన్' UNION ALL SELECT 'pine', 'ta', 'பைன்' UNION ALL
  SELECT 'acacia', 'kn', 'ಅಕೇಶಿಯಾ' UNION ALL SELECT 'acacia', 'hi', 'अकेशिया' UNION ALL SELECT 'acacia', 'te', 'అకేషియా' UNION ALL SELECT 'acacia', 'ta', 'அகேசியா' UNION ALL
  SELECT 'silver-oak', 'kn', 'ಸಿಲ್ವರ್ ಓಕ್' UNION ALL SELECT 'silver-oak', 'hi', 'सिल्वर ओक' UNION ALL SELECT 'silver-oak', 'te', 'సిల్వర్ ఓక్' UNION ALL SELECT 'silver-oak', 'ta', 'சில்வர் ஓக்' UNION ALL
  SELECT 'tamarind', 'kn', 'ಹುಣಸೆ' UNION ALL SELECT 'tamarind', 'hi', 'इमली' UNION ALL SELECT 'tamarind', 'te', 'చింత' UNION ALL SELECT 'tamarind', 'ta', 'புளி' UNION ALL
  SELECT 'honge-indian-beech', 'kn', 'ಹೊಂಗೆ' UNION ALL SELECT 'honge-indian-beech', 'hi', 'करंज' UNION ALL SELECT 'honge-indian-beech', 'te', 'కానుగ' UNION ALL SELECT 'honge-indian-beech', 'ta', 'புங்கை'
) AS names
JOIN `wood_types` wt ON wt.slug = names.slug;

-- ===== END server/database/009_additional_regional_wood_names.sql =====

-- ===== BEGIN server/database/010_invoice_wood_type_foreign_key.sql =====
-- Ensure invoice line items refer to the shared wood catalogue.
-- Safe to re-run: the constraint is added only when no equivalent foreign
-- key exists. Apply after 007_wood_type_catalogue.sql has created wood_types.

SET @has_wood_type_fk = (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'invoice_items'
    AND COLUMN_NAME = 'wood_type_id'
    AND REFERENCED_TABLE_NAME = 'wood_types'
    AND REFERENCED_COLUMN_NAME = 'id'
);

SET @add_wood_type_fk = IF(
  @has_wood_type_fk = 0,
  'ALTER TABLE `invoice_items` ADD CONSTRAINT `fk_invoice_items_wood_type` FOREIGN KEY (`wood_type_id`) REFERENCES `wood_types` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE add_wood_type_fk FROM @add_wood_type_fk;
EXECUTE add_wood_type_fk;
DEALLOCATE PREPARE add_wood_type_fk;

-- ===== END server/database/010_invoice_wood_type_foreign_key.sql =====
