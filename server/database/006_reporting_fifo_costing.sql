-- Reporting uses FIFO batch costs for inventory valuation and gross margin.
ALTER TABLE `sales_order_items`
  ADD COLUMN `unit_cost_at_fulfillment` DECIMAL(12, 2) NULL AFTER `line_total`,
  ADD COLUMN `total_cost_at_fulfillment` DECIMAL(14, 2) NULL AFTER `unit_cost_at_fulfillment`;

ALTER TABLE `timber_batches`
  ADD INDEX `idx_tb_fifo_layers` (`ownership`, `timber_type`, `species`, `unit`, `created_at`, `id`);

CREATE TABLE IF NOT EXISTS `reporting_settings` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `inventory_costing_method` ENUM('fifo') NOT NULL DEFAULT 'fifo',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_reporting_settings_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permissions` (`name`, `module`, `description`)
VALUES ('view_reports', 'analytics', 'View operational and financial reports')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT INTO `reporting_settings` (`id`, `inventory_costing_method`)
VALUES (1, 'fifo')
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name = 'view_reports'
WHERE r.name IN ('admin', 'manager', 'accountant')
