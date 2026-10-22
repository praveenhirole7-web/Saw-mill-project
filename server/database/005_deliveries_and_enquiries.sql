-- Delivery tracking and private public-enquiry management.
INSERT INTO `permissions` (`name`, `module`, `description`) VALUES
('view_enquiries', 'enquiries', 'View, assign, and update public customer enquiries'),
('manage_enquiries', 'enquiries', 'Manage and convert customer enquiries'),
('view_deliveries', 'deliveries', 'View delivery records and history'),
('manage_deliveries', 'deliveries', 'Schedule and update deliveries')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN ('view_enquiries', 'manage_enquiries', 'view_deliveries', 'manage_deliveries')
WHERE r.name IN ('admin', 'accountant');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN ('view_enquiries', 'manage_enquiries', 'view_deliveries')
WHERE r.name = 'manager';

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
