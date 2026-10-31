-- ==============================================================================
-- SAW MILL MANAGEMENT SYSTEM (TIMBERCRAFT) - NORMALIZED MYSQL SCHEMA
-- Database: sawmill_db
-- Storage Engine: InnoDB
-- Character Set: utf8mb4 (Unicode 5.2.0 or later compliant, full multilingual & emoji support)
-- Collation: utf8mb4_unicode_ci
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- ------------------------------------------------------------------------------
-- DATABASE INITIALIZATION (Safe, idempotent)
-- ------------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `sawmill_db`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `sawmill_db`;

-- ==============================================================================
-- 1. ROLES
-- Role-based access control definition for system operators, staff, and owners.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System RBAC roles';

-- ==============================================================================
-- 2. PERMISSIONS
-- Granular system capabilities organized by functional business module.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL,
  `module` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_name` (`name`),
  INDEX `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Granular access capabilities';

-- ==============================================================================
-- 3. ROLE_PERMISSIONS
-- Join table establishing role-to-permission authorizations.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  INDEX `idx_rp_permission_id` (`permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`)
    REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Role and permission mappings';

-- ==============================================================================
-- 21. EMPLOYEES (Created early to allow foreign key reference from users)
-- Sawmill workforce registry with employment status, department, and compensation.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `employees` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(150) NULL,
  `job_title` VARCHAR(120) NOT NULL,
  `department` VARCHAR(100) NOT NULL DEFAULT 'Operations',
  `joining_date` DATE NOT NULL,
  `salary` DECIMAL(12, 2) NULL DEFAULT NULL,
  `salary_period` ENUM('hourly', 'monthly', 'annual') NULL DEFAULT 'monthly',
  `status` ENUM('active', 'on_leave', 'terminated', 'resigned') NOT NULL DEFAULT 'active',
  `created_by_id` INT UNSIGNED NULL,
  `updated_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employees_code` (`employee_code`),
  INDEX `idx_employees_name` (`name`),
  INDEX `idx_employees_department` (`department`),
  INDEX `idx_employees_status` (`status`),
  INDEX `idx_employees_joining_date` (`joining_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Employee and staff workforce registry';

-- ==============================================================================
-- 4. USERS
-- User login accounts, bcrypt password hashes, token invalidation, and role assignment.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_id` INT UNSIGNED NOT NULL,
  `employee_id` INT UNSIGNED NULL,
  `token_version` INT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('active', 'inactive', 'suspended', 'pending', 'rejected') NOT NULL DEFAULT 'active',
  `phone` VARCHAR(30) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_employee_id` (`employee_id`),
  INDEX `idx_users_role_id` (`role_id`),
  INDEX `idx_users_status` (`status`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_users_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System user credentials and auth status';

-- Add user reference constraints on employees
ALTER TABLE `employees`
  ADD CONSTRAINT `fk_employees_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_employees_updated_by` FOREIGN KEY (`updated_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------
-- Supporting: Staff Registration Requests (Approval queue for public/staff signups)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_registration_requests` (
  `user_id` INT UNSIGNED NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `contact_email` VARCHAR(150) NULL,
  `department` VARCHAR(120) NOT NULL,
  `request_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by_id` INT UNSIGNED NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  INDEX `idx_srr_status_created` (`request_status`, `created_at`),
  CONSTRAINT `fk_srr_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_srr_reviewed_by` FOREIGN KEY (`reviewed_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Staff pending approval requests';

-- ------------------------------------------------------------------------------
-- Supporting: User Permissions (Per-user explicit overrides)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`user_id`, `permission_id`),
  CONSTRAINT `fk_up_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_up_permission` FOREIGN KEY (`permission_id`)
    REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Per-user permission grant overrides';

CREATE TABLE IF NOT EXISTS `user_permission_settings` (
  `user_id` INT UNSIGNED NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_ups_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tracks when individual user permissions were configured';

-- ==============================================================================
-- 5. CUSTOMERS
-- Commercial clients, furniture makers, and custom milling clients.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_code` VARCHAR(50) NULL,
  `name` VARCHAR(120) NOT NULL,
  `contact_person` VARCHAR(120) NULL,
  `company_name` VARCHAR(150) NULL,
  `email` VARCHAR(150) NULL,
  `phone` VARCHAR(30) NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'Commercial Contractor',
  `address` TEXT NULL,
  `city` VARCHAR(100) NULL,
  `tax_gst_number` VARCHAR(50) NULL,
  `credit_limit` DECIMAL(12, 2) NOT NULL DEFAULT 50000.00,
  `payment_terms` VARCHAR(50) NOT NULL DEFAULT 'Net 30',
  `status` ENUM('Active', 'Inactive', 'Suspended') NOT NULL DEFAULT 'Active',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_code` (`customer_code`),
  INDEX `idx_customers_name` (`name`),
  INDEX `idx_customers_phone` (`phone`),
  INDEX `idx_customers_email` (`email`),
  INDEX `idx_customers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer directory and commercial credit limits';

-- ==============================================================================
-- 6. SUPPLIERS
-- Forest concessions, timber harvesting contractors, and log vendors.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `supplier_code` VARCHAR(50) NULL,
  `company_name` VARCHAR(150) NOT NULL,
  `rep_name` VARCHAR(120) NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) NULL,
  `region` VARCHAR(100) NOT NULL DEFAULT 'Pacific Northwest',
  `specialty` VARCHAR(255) NOT NULL DEFAULT 'Douglas Fir, Western Red Cedar',
  `payment_terms` VARCHAR(50) NOT NULL DEFAULT 'Net 30 Days',
  `status` ENUM('Active', 'Preferred', 'Inactive') NOT NULL DEFAULT 'Active',
  `rating` DECIMAL(2, 1) NOT NULL DEFAULT 4.5,
  `address` TEXT NULL,
  `tax_id` VARCHAR(50) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_suppliers_code` (`supplier_code`),
  INDEX `idx_suppliers_company` (`company_name`),
  INDEX `idx_suppliers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Timber suppliers and log vendor registry';

-- ==============================================================================
-- 7. WOOD_TYPES
-- Master botanical catalogue of timber species, classification, and metadata.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `wood_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(100) NOT NULL,
  `common_name_en` VARCHAR(150) NOT NULL,
  `scientific_name` VARCHAR(200) NULL,
  `scientific_name_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `common_name_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `density_kg_m3` DECIMAL(8, 2) NULL COMMENT 'Air dry density (kg/m3)',
  `grain_pattern` VARCHAR(100) NULL,
  `durability_class` VARCHAR(50) NULL,
  `image_url` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wood_types_slug` (`slug`),
  INDEX `idx_wood_types_common_name` (`common_name_en`),
  INDEX `idx_wood_types_scientific_name` (`scientific_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Master wood botanical species catalogue';

-- ------------------------------------------------------------------------------
-- Supporting: Multilingual Regional Wood Names (Kannada, Hindi, Telugu, Tamil, etc.)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wood_names` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `wood_type_id` INT UNSIGNED NOT NULL,
  `language_code` VARCHAR(10) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `name_kind` ENUM('preferred', 'alias') NOT NULL DEFAULT 'preferred',
  `verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wood_names_type_lang_name` (`wood_type_id`, `language_code`, `name`),
  INDEX `idx_wood_names_language_name` (`language_code`, `name`),
  CONSTRAINT `fk_wood_names_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Localized and regional timber names';

-- ==============================================================================
-- 8. PRODUCTS
-- Standardized catalogue definitions for mill-produced lumber, boards, and beams.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_code` VARCHAR(60) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(150) NULL,
  `wood_type_id` INT UNSIGNED NULL,
  `timber_type` ENUM('raw_log', 'sawn_timber') NOT NULL DEFAULT 'sawn_timber',
  `category` VARCHAR(60) NOT NULL DEFAULT 'Dimensional Lumber',
  `grade` VARCHAR(50) NOT NULL DEFAULT 'Select & Better',
  `dimensions_text` VARCHAR(100) NULL,
  `thickness_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `width_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `length_feet` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `unit_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `description` TEXT NULL,
  `image_url` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_code` (`product_code`),
  UNIQUE KEY `uq_products_slug` (`slug`),
  INDEX `idx_products_wood_type` (`wood_type_id`),
  INDEX `idx_products_category` (`category`),
  INDEX `idx_products_active` (`is_active`),
  CONSTRAINT `fk_products_wood_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Standardized timber product catalog';

-- ==============================================================================
-- 9. TIMBER_BATCHES
-- Physical stock inventory representing raw round logs and sawn dimensional batches.
-- Supports mill-owned inventory and customer-owned timber held for custom sawing.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `timber_batches` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `batch_code` VARCHAR(60) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `product_id` INT UNSIGNED NULL,
  `wood_type_id` INT UNSIGNED NULL,
  `timber_type` ENUM('raw_log', 'sawn_timber') NOT NULL DEFAULT 'sawn_timber',
  `category` VARCHAR(60) NOT NULL DEFAULT 'Dimensional Lumber',
  `species` VARCHAR(100) NOT NULL,
  `grade` VARCHAR(50) NOT NULL DEFAULT 'Select & Better',
  `dimensions_text` VARCHAR(100) NULL,
  `length_feet` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `width_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `thickness_inches` DECIMAL(8, 2) NULL DEFAULT 0.00,
  `girth_inches` DECIMAL(8, 2) NULL DEFAULT 0.00 COMMENT 'Quarter-girth for Hoppus round log volume',
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `pieces_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `calculated_volume_cbf` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `calculated_board_feet` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_total` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_available` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_reserved` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `quantity_consumed` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `ownership` ENUM('mill', 'customer') NOT NULL DEFAULT 'mill',
  `customer_id` INT UNSIGNED NULL COMMENT 'Owner if ownership is customer-owned',
  `supplier_id` INT UNSIGNED NULL COMMENT 'Source vendor if mill procurement',
  `status` ENUM('In Stock', 'Low Stock', 'Reserved', 'Consumed', 'Quarantine') NOT NULL DEFAULT 'In Stock',
  `yard_location` VARCHAR(100) NOT NULL DEFAULT 'Yard Bay A-1',
  `moisture_percent` DECIMAL(5, 2) NOT NULL DEFAULT 12.00,
  `min_stock_threshold` DECIMAL(12, 3) NOT NULL DEFAULT 50.000,
  `cost_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `selling_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `image_url` VARCHAR(500) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tb_batch_code` (`batch_code`),
  INDEX `idx_tb_product_id` (`product_id`),
  INDEX `idx_tb_wood_type_id` (`wood_type_id`),
  INDEX `idx_tb_timber_type` (`timber_type`),
  INDEX `idx_tb_category` (`category`),
  INDEX `idx_tb_species` (`species`),
  INDEX `idx_tb_status` (`status`),
  INDEX `idx_tb_ownership` (`ownership`),
  INDEX `idx_tb_customer_id` (`customer_id`),
  INDEX `idx_tb_supplier_id` (`supplier_id`),
  INDEX `idx_tb_fifo_layers` (`ownership`, `timber_type`, `species`, `unit`, `created_at`, `id`),
  CONSTRAINT `fk_tb_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tb_wood_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tb_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tb_supplier` FOREIGN KEY (`supplier_id`)
    REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Physical timber stock batches in yard';

-- ==============================================================================
-- 10. STOCK_MOVEMENTS
-- Immutable audit ledger recording every inventory receipt, issue, cut, or adjustment.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `movement_number` VARCHAR(60) NULL,
  `batch_id` INT UNSIGNED NOT NULL,
  `movement_type` ENUM('receipt', 'issue', 'adjustment_add', 'adjustment_deduct', 'reservation', 'release', 'consumption') NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `previous_quantity` DECIMAL(12, 3) NOT NULL,
  `new_quantity` DECIMAL(12, 3) NOT NULL,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `source_transaction_type` VARCHAR(60) NOT NULL COMMENT 'initial_intake, purchase, sales_order, cutting_job, manual_adjustment',
  `source_transaction_id` VARCHAR(60) NULL,
  `reason` TEXT NOT NULL,
  `authorized_by_id` INT UNSIGNED NULL,
  `allow_negative` BOOLEAN NOT NULL DEFAULT FALSE,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sm_movement_number` (`movement_number`),
  INDEX `idx_sm_batch` (`batch_id`),
  INDEX `idx_sm_type` (`movement_type`),
  INDEX `idx_sm_created` (`created_at`),
  INDEX `idx_sm_source` (`source_transaction_type`, `source_transaction_id`),
  CONSTRAINT `fk_sm_batch` FOREIGN KEY (`batch_id`)
    REFERENCES `timber_batches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sm_authorized_by` FOREIGN KEY (`authorized_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Immutable inventory transaction ledger';

-- ==============================================================================
-- 11. PURCHASES
-- Procurement orders for raw timber and saw logs from suppliers.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `purchases` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `purchase_number` VARCHAR(60) NOT NULL,
  `supplier_id` INT UNSIGNED NOT NULL,
  `status` ENUM('draft', 'ordered', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  `payment_status` ENUM('pending', 'partially_paid', 'paid') NOT NULL DEFAULT 'pending',
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'Bank Wire Transfer',
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchases_number` (`purchase_number`),
  INDEX `idx_purchases_supplier` (`supplier_id`),
  INDEX `idx_purchases_status` (`status`),
  INDEX `idx_purchases_payment_status` (`payment_status`),
  INDEX `idx_purchases_created_at` (`created_at`),
  CONSTRAINT `fk_purchases_supplier` FOREIGN KEY (`supplier_id`)
    REFERENCES `suppliers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_purchases_received_by` FOREIGN KEY (`received_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Supplier timber purchase orders';

-- ==============================================================================
-- 12. PURCHASE_ITEMS
-- Line item breakdown for each procured log or timber batch.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `purchase_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `purchase_id` INT UNSIGNED NOT NULL,
  `wood_type_id` INT UNSIGNED NULL,
  `product_id` INT UNSIGNED NULL,
  `timber_type` ENUM('raw_log', 'sawn_timber') NOT NULL DEFAULT 'raw_log',
  `species` VARCHAR(100) NOT NULL,
  `grade` VARCHAR(50) NOT NULL DEFAULT 'Grade A',
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_pi_purchase` (`purchase_id`),
  INDEX `idx_pi_wood_type` (`wood_type_id`),
  INDEX `idx_pi_product` (`product_id`),
  INDEX `idx_pi_generated_batch` (`generated_batch_id`),
  CONSTRAINT `fk_pi_purchase` FOREIGN KEY (`purchase_id`)
    REFERENCES `purchases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pi_wood_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pi_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pi_batch` FOREIGN KEY (`generated_batch_id`)
    REFERENCES `timber_batches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Line items for purchase orders';

-- ==============================================================================
-- 13. CUTTING_JOBS
-- Production sawing work orders converting raw round logs into lumber.
-- Supports internal saw production and custom client-ordered milling.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `cutting_jobs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_number` VARCHAR(60) NOT NULL,
  `job_title` VARCHAR(150) NOT NULL,
  `job_type` ENUM('customer_order', 'internal_production') NOT NULL DEFAULT 'customer_order',
  `customer_id` INT UNSIGNED NULL,
  `saw_line` VARCHAR(100) NOT NULL DEFAULT 'Line 1 (60" Band Saw)',
  `operator_name` VARCHAR(100) NULL,
  `assigned_operator_id` INT UNSIGNED NULL,
  `priority` ENUM('Low', 'Normal', 'High', 'Urgent') NOT NULL DEFAULT 'Normal',
  `requested_dimensions` VARCHAR(150) NOT NULL,
  `kerf_allowance` VARCHAR(50) NOT NULL DEFAULT '0.125"',
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cj_job_number` (`job_number`),
  INDEX `idx_cj_status` (`status`),
  INDEX `idx_cj_customer` (`customer_id`),
  INDEX `idx_cj_ownership` (`ownership`),
  INDEX `idx_cj_start_date` (`start_date`),
  INDEX `idx_cj_due_date` (`due_date`),
  CONSTRAINT `fk_cj_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cj_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cj_completed_by` FOREIGN KEY (`completed_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cj_assigned_operator` FOREIGN KEY (`assigned_operator_id`)
    REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Milling cut orders and recovery yields';

-- ==============================================================================
-- 14. CUTTING_JOB_INPUTS
-- Timber batches and raw logs issued and consumed into the saw carriage.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `cutting_job_inputs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cutting_job_id` INT UNSIGNED NOT NULL,
  `batch_id` INT UNSIGNED NOT NULL,
  `quantity_used` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cji_job` (`cutting_job_id`),
  INDEX `idx_cji_batch` (`batch_id`),
  CONSTRAINT `fk_cji_job` FOREIGN KEY (`cutting_job_id`)
    REFERENCES `cutting_jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cji_batch` FOREIGN KEY (`batch_id`)
    REFERENCES `timber_batches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Input logs consumed by sawing order';

-- ==============================================================================
-- 15. CUTTING_JOB_OUTPUTS
-- Sawn lumber products and recovery output produced from the cut operation.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `cutting_job_outputs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cutting_job_id` INT UNSIGNED NOT NULL,
  `generated_batch_id` INT UNSIGNED NULL,
  `wood_type_id` INT UNSIGNED NULL,
  `product_name` VARCHAR(150) NOT NULL,
  `species` VARCHAR(100) NOT NULL,
  `dimensions_text` VARCHAR(100) NOT NULL,
  `thickness_inches` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `width_inches` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `length_feet` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
  `pieces_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `volume_cbf` DECIMAL(12, 3) NOT NULL DEFAULT 0.000,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'CFT',
  `grade` VARCHAR(50) NOT NULL DEFAULT 'Select Structural',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cjo_job` (`cutting_job_id`),
  INDEX `idx_cjo_batch` (`generated_batch_id`),
  INDEX `idx_cjo_wood_type` (`wood_type_id`),
  CONSTRAINT `fk_cjo_job` FOREIGN KEY (`cutting_job_id`)
    REFERENCES `cutting_jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cjo_batch` FOREIGN KEY (`generated_batch_id`)
    REFERENCES `timber_batches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cjo_wood_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Output lumber produced by sawing order';

-- ==============================================================================
-- 16. SALES_ORDERS
-- Customer orders for lumber purchases, milling services, or commercial delivery.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `sales_orders` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_number` VARCHAR(60) NOT NULL,
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_so_order_number` (`order_number`),
  INDEX `idx_so_customer` (`customer_id`),
  INDEX `idx_so_status` (`status`),
  INDEX `idx_so_payment_status` (`payment_status`),
  INDEX `idx_so_order_date` (`order_date`),
  CONSTRAINT `fk_so_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_so_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Wholesale timber sales orders';

-- ==============================================================================
-- 17. SALES_ORDER_ITEMS
-- Sawn timber and lumber line items committed to a sales order.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `sales_order_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sales_order_id` INT UNSIGNED NOT NULL,
  `product_id` INT UNSIGNED NULL,
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_soi_order` (`sales_order_id`),
  INDEX `idx_soi_batch` (`batch_id`),
  INDEX `idx_soi_product` (`product_id`),
  CONSTRAINT `fk_soi_order` FOREIGN KEY (`sales_order_id`)
    REFERENCES `sales_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_soi_batch` FOREIGN KEY (`batch_id`)
    REFERENCES `timber_batches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_soi_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Line items for sales orders';

-- ------------------------------------------------------------------------------
-- Supporting: Sales Order Status Transition History
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sales_order_history` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sales_order_id` INT UNSIGNED NOT NULL,
  `from_status` VARCHAR(50) NULL,
  `to_status` VARCHAR(50) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `changed_by_id` INT UNSIGNED NULL,
  `reason` TEXT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_soh_order` (`sales_order_id`),
  INDEX `idx_soh_created` (`created_at`),
  CONSTRAINT `fk_soh_order` FOREIGN KEY (`sales_order_id`)
    REFERENCES `sales_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_soh_changed_by` FOREIGN KEY (`changed_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sales order workflow transition history';

-- ==============================================================================
-- 18. INVOICES
-- Authoritative commercial billing ledger.
-- Supports multiple invoices per sales order (milestone billing, partial deliveries).
-- Prevents destructive edits to historical financial data via voiding workflow.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(60) NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `sales_order_id` INT UNSIGNED NULL COMMENT 'Multiple invoices may reference one sales order',
  `cutting_job_id` INT UNSIGNED NULL COMMENT 'Direct sawing job billing',
  `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `taxable_value` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(6, 4) NOT NULL DEFAULT 0.0000 COMMENT 'Stored as decimal fraction e.g. 0.1800 for 18%',
  `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `additional_charges` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `cutting_charge` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `grand_total` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `amount_due` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `payment_status` ENUM('unpaid', 'partially_paid', 'paid', 'voided') NOT NULL DEFAULT 'unpaid',
  `issue_date` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'INR',
  `language_code` VARCHAR(10) NOT NULL DEFAULT 'en',
  `payment_terms` VARCHAR(100) NOT NULL DEFAULT 'Net 30',
  `notes` TEXT NULL,
  `created_by_id` INT UNSIGNED NULL,
  `voided_by_id` INT UNSIGNED NULL,
  `voided_at` TIMESTAMP NULL,
  `void_reason` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_number` (`invoice_number`),
  INDEX `idx_inv_customer` (`customer_id`),
  INDEX `idx_inv_sales_order` (`sales_order_id`),
  INDEX `idx_inv_cutting_job` (`cutting_job_id`),
  INDEX `idx_inv_status` (`payment_status`),
  INDEX `idx_inv_issue_date` (`issue_date`),
  INDEX `idx_inv_due_date` (`due_date`),
  CONSTRAINT `fk_inv_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_sales_order` FOREIGN KEY (`sales_order_id`)
    REFERENCES `sales_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_cutting_job` FOREIGN KEY (`cutting_job_id`)
    REFERENCES `cutting_jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_voided_by` FOREIGN KEY (`voided_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Financial invoice master records';

-- ------------------------------------------------------------------------------
-- Supporting: Invoice Items (Itemized billed products and cutting fees)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` INT UNSIGNED NOT NULL,
  `wood_type_id` INT UNSIGNED NULL,
  `product_id` INT UNSIGNED NULL,
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ii_invoice` (`invoice_id`),
  INDEX `idx_ii_wood_type` (`wood_type_id`),
  INDEX `idx_ii_product` (`product_id`),
  CONSTRAINT `fk_ii_invoice` FOREIGN KEY (`invoice_id`)
    REFERENCES `invoices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ii_wood_type` FOREIGN KEY (`wood_type_id`)
    REFERENCES `wood_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ii_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Line items for customer invoices';

-- ==============================================================================
-- 19. PAYMENTS
-- Master financial payment ledger supporting partial payments against invoices,
-- supplier purchase settlements, idempotent transaction tracking, and reversals.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payment_number` VARCHAR(60) NOT NULL,
  `payment_type` ENUM('customer_payment', 'supplier_payment') NOT NULL DEFAULT 'customer_payment',
  `invoice_id` INT UNSIGNED NULL COMMENT 'Supports partial payments against invoices',
  `purchase_id` INT UNSIGNED NULL COMMENT 'Supplier payment settlement',
  `customer_id` INT UNSIGNED NULL,
  `supplier_id` INT UNSIGNED NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `payment_method` ENUM('cash', 'bank_transfer', 'upi', 'cheque', 'credit_card', 'other') NOT NULL DEFAULT 'bank_transfer',
  `payment_date` DATE NOT NULL,
  `transaction_reference` VARCHAR(150) NULL COMMENT 'Bank UTR, cheque number, or UPI ID',
  `idempotency_key` VARCHAR(100) NULL,
  `balance_after` DECIMAL(14, 2) NULL,
  `status` ENUM('posted', 'reversed') NOT NULL DEFAULT 'posted',
  `reversed_by_payment_id` INT UNSIGNED NULL,
  `reversal_reason` TEXT NULL,
  `reversed_at` TIMESTAMP NULL,
  `notes` TEXT NULL,
  `recorded_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pay_number` (`payment_number`),
  UNIQUE KEY `uq_pay_idempotency` (`idempotency_key`),
  INDEX `idx_pay_invoice` (`invoice_id`),
  INDEX `idx_pay_purchase` (`purchase_id`),
  INDEX `idx_pay_customer` (`customer_id`),
  INDEX `idx_pay_supplier` (`supplier_id`),
  INDEX `idx_pay_type` (`payment_type`),
  INDEX `idx_pay_status` (`status`),
  INDEX `idx_pay_date` (`payment_date`),
  CONSTRAINT `fk_pay_invoice` FOREIGN KEY (`invoice_id`)
    REFERENCES `invoices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pay_purchase` FOREIGN KEY (`purchase_id`)
    REFERENCES `purchases` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pay_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pay_supplier` FOREIGN KEY (`supplier_id`)
    REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pay_recorded_by` FOREIGN KEY (`recorded_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pay_reversed_by` FOREIGN KEY (`reversed_by_payment_id`)
    REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Settlement and partial payment ledger';

-- ------------------------------------------------------------------------------
-- Backward compatibility table: customer_payments
-- Preserves existing queries in invoiceRepository.js without breaking change
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payment_number` VARCHAR(60) NOT NULL,
  `invoice_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `payment_method` ENUM('cash', 'bank_transfer', 'upi', 'cheque', 'credit_card', 'other') NOT NULL DEFAULT 'bank_transfer',
  `payment_date` DATE NOT NULL,
  `transaction_reference` VARCHAR(150) NULL,
  `idempotency_key` VARCHAR(100) NULL,
  `balance_after` DECIMAL(14, 2) NULL,
  `notes` TEXT NULL,
  `status` ENUM('posted', 'reversed') NOT NULL DEFAULT 'posted',
  `reversed_by_payment_id` INT UNSIGNED NULL,
  `reversal_reason` TEXT NULL,
  `reversed_at` TIMESTAMP NULL,
  `recorded_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cp_payment_number` (`payment_number`),
  UNIQUE KEY `uq_cp_idempotency` (`idempotency_key`),
  INDEX `idx_cp_invoice` (`invoice_id`),
  INDEX `idx_cp_customer` (`customer_id`),
  INDEX `idx_cp_status` (`status`),
  INDEX `idx_cp_date` (`payment_date`),
  CONSTRAINT `fk_cp_invoice` FOREIGN KEY (`invoice_id`)
    REFERENCES `invoices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cp_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cp_recorded_by` FOREIGN KEY (`recorded_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Legacy customer payment receipt ledger';

-- ==============================================================================
-- 20. EXPENSES
-- Operating expenses tracking with audit trails and reversal capability.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ec_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Operating expense categorization';

CREATE TABLE IF NOT EXISTS `expenses` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `expense_number` VARCHAR(60) NULL,
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
  `reversed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expenses_number` (`expense_number`),
  INDEX `idx_expenses_date` (`expense_date`),
  INDEX `idx_expenses_category_date` (`category_id`, `expense_date`),
  INDEX `idx_expenses_status_date` (`status`, `expense_date`),
  CONSTRAINT `fk_expenses_category` FOREIGN KEY (`category_id`)
    REFERENCES `expense_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_expenses_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_expenses_updated_by` FOREIGN KEY (`updated_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_expenses_reversed_by` FOREIGN KEY (`reversed_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Operating and yard expense ledger';

-- ==============================================================================
-- 22. DELIVERIES
-- Transport logistics, vehicle dispatch, and delivery confirmations.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `deliveries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `delivery_number` VARCHAR(60) NOT NULL,
  `sales_order_id` INT UNSIGNED NOT NULL,
  `status` ENUM('scheduled', 'dispatched', 'delivered', 'failed') NOT NULL DEFAULT 'scheduled',
  `planned_delivery_date` DATE NOT NULL,
  `vehicle_info` VARCHAR(160) NULL,
  `driver_name` VARCHAR(120) NULL,
  `driver_phone` VARCHAR(30) NULL,
  `transport_notes` TEXT NULL,
  `delivery_confirmation_name` VARCHAR(120) NULL,
  `delivery_confirmation_notes` TEXT NULL,
  `delivered_at` DATETIME NULL,
  `failure_reason` VARCHAR(500) NULL,
  `created_by_id` INT UNSIGNED NULL,
  `updated_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deliveries_number` (`delivery_number`),
  INDEX `idx_deliveries_sales_order` (`sales_order_id`),
  INDEX `idx_deliveries_status_date` (`status`, `planned_delivery_date`),
  CONSTRAINT `fk_deliveries_order` FOREIGN KEY (`sales_order_id`)
    REFERENCES `sales_orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_deliveries_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_deliveries_updated_by` FOREIGN KEY (`updated_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Timber delivery and shipment logistics';

-- ------------------------------------------------------------------------------
-- Supporting: Delivery Status Transition History
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `delivery_history` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `delivery_id` INT UNSIGNED NOT NULL,
  `from_status` VARCHAR(30) NULL,
  `to_status` VARCHAR(30) NOT NULL,
  `action` VARCHAR(60) NOT NULL,
  `changed_by_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_delivery_history_delivery` (`delivery_id`, `created_at`),
  CONSTRAINT `fk_dh_delivery` FOREIGN KEY (`delivery_id`)
    REFERENCES `deliveries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dh_changed_by` FOREIGN KEY (`changed_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit history for delivery status';

-- ==============================================================================
-- 23. ENQUIRIES
-- Customer inquiries, quote requests, and conversion pipeline.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `enquiries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(40) NOT NULL,
  `source` ENUM('quote', 'contact', 'walk_in', 'phone') NOT NULL DEFAULT 'quote',
  `name` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `email` VARCHAR(150) NULL,
  `requested_product` VARCHAR(150) NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 1.000,
  `quantity_unit` VARCHAR(40) NOT NULL DEFAULT 'CFT',
  `service_required` VARCHAR(120) NULL,
  `dimensions` VARCHAR(255) NULL,
  `preferred_delivery_date` DATE NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('new', 'qualified', 'in_progress', 'converted', 'closed') NOT NULL DEFAULT 'new',
  `assigned_to_id` INT UNSIGNED NULL,
  `internal_notes` TEXT NULL,
  `customer_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enquiries_reference` (`reference`),
  INDEX `idx_enquiries_status_created` (`status`, `created_at`),
  INDEX `idx_enquiries_email` (`email`),
  INDEX `idx_enquiries_phone` (`phone`),
  INDEX `idx_enquiries_customer_id` (`customer_id`),
  CONSTRAINT `fk_enquiries_assigned_to` FOREIGN KEY (`assigned_to_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_enquiries_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer inquiries and quote requests';

-- Backward compatibility view / table for customer_enquiries
CREATE TABLE IF NOT EXISTS `customer_enquiries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(40) NOT NULL,
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ce_reference` (`reference`),
  INDEX `idx_ce_status_created` (`status`, `created_at`),
  INDEX `idx_ce_email` (`email`),
  INDEX `idx_ce_phone` (`phone`),
  CONSTRAINT `fk_ce_assigned_to` FOREIGN KEY (`assigned_to_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ce_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customer quote and enquiry requests';

-- Supporting: Enquiry Status History & Quotations
CREATE TABLE IF NOT EXISTS `enquiry_history` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `enquiry_id` INT UNSIGNED NOT NULL,
  `from_status` VARCHAR(30) NULL,
  `to_status` VARCHAR(30) NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `changed_by_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_eh_enquiry` (`enquiry_id`, `created_at`),
  CONSTRAINT `fk_eh_enquiry` FOREIGN KEY (`enquiry_id`)
    REFERENCES `customer_enquiries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_eh_changed_by` FOREIGN KEY (`changed_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit timeline for enquiry progression';

CREATE TABLE IF NOT EXISTS `enquiry_quotations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `quotation_number` VARCHAR(60) NOT NULL,
  `enquiry_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `requested_product` VARCHAR(150) NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `quantity_unit` VARCHAR(40) NOT NULL,
  `service_required` VARCHAR(120) NULL,
  `dimensions` VARCHAR(255) NULL,
  `status` ENUM('draft', 'issued', 'accepted', 'declined', 'expired') NOT NULL DEFAULT 'draft',
  `created_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_eq_number` (`quotation_number`),
  UNIQUE KEY `uq_eq_enquiry` (`enquiry_id`),
  CONSTRAINT `fk_eq_enquiry` FOREIGN KEY (`enquiry_id`)
    REFERENCES `customer_enquiries` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_eq_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_eq_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Formal price quotations for customer enquiries';

-- ==============================================================================
-- 24. DOCUMENTS
-- Centralized document registry for generated invoice PDFs, delivery slips,
-- forest transit passes, sawmill licenses, and contracts.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `documents` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_number` VARCHAR(60) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `document_type` ENUM('invoice_pdf', 'delivery_receipt', 'cutting_sheet', 'transit_pass', 'purchase_order', 'contract', 'inspection_cert', 'other') NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  `file_size_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `entity_type` VARCHAR(50) NULL COMMENT 'invoices, sales_orders, cutting_jobs, purchases',
  `entity_id` INT UNSIGNED NULL COMMENT 'Identifier in the referenced entity table',
  `uploaded_by_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_documents_number` (`document_number`),
  INDEX `idx_documents_type` (`document_type`),
  INDEX `idx_documents_entity` (`entity_type`, `entity_id`),
  INDEX `idx_documents_uploader` (`uploaded_by_id`),
  CONSTRAINT `fk_documents_uploader` FOREIGN KEY (`uploaded_by_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Document asset repository and business attachments';

-- ==============================================================================
-- 25. AUDIT_LOGS
-- Security, operational, and administrative audit trail.
-- Records administrative decisions, approvals, rejections, and state modifications.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL,
  `action` VARCHAR(100) NOT NULL,
  `table_name` VARCHAR(80) NULL,
  `record_id` INT UNSIGNED NULL,
  `description` TEXT NULL,
  `old_values` JSON NULL COMMENT 'Before-state change payload',
  `new_values` JSON NULL COMMENT 'After-state change payload',
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_action` (`action`),
  INDEX `idx_audit_created` (`created_at`),
  INDEX `idx_audit_table_record` (`table_name`, `record_id`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Immutable administrative and security audit trail';

-- ------------------------------------------------------------------------------
-- Supporting: Billing Sequences, Token Sessions, and Singleton Configuration
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `billing_sequences` (
  `sequence_name` VARCHAR(32) NOT NULL,
  `last_value` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`sequence_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Atomic counter sequences for invoices and payments';

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rt_token_hash` (`token_hash`),
  INDEX `idx_rt_user` (`user_id`),
  INDEX `idx_rt_expiry` (`expires_at`),
  CONSTRAINT `fk_rt_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Active JWT refresh token sessions';

CREATE TABLE IF NOT EXISTS `revoked_access_tokens` (
  `token_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_hash`),
  INDEX `idx_rat_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Revoked JWT access token blacklist';

CREATE TABLE IF NOT EXISTS `reporting_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `inventory_costing_method` ENUM('fifo') NOT NULL DEFAULT 'fifo',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_reporting_settings_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Singleton reporting preferences';

SET FOREIGN_KEY_CHECKS = 1;
