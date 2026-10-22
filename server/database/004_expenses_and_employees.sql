-- Expense and employee management schema and access grants.
INSERT INTO `permissions` (`name`, `module`, `description`) VALUES
('view_expenses', 'expenses', 'View expenses and expense reports'),
('manage_expenses', 'expenses', 'Create and edit expenses and categories'),
('reverse_expenses', 'expenses', 'Reverse posted expenses with a reason'),
('view_employees', 'employees', 'View employee records'),
('manage_employees', 'employees', 'Create and update employee records'),
('view_employee_salary', 'employees', 'View employee salary information'),
('manage_employee_salary', 'employees', 'Create and update employee salary information')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN (
  'view_expenses', 'manage_expenses', 'reverse_expenses',
  'view_employees', 'manage_employees', 'view_employee_salary',
  'manage_employee_salary'
)
WHERE r.name = 'admin';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN (
  'view_expenses', 'manage_expenses', 'view_employees',
  'manage_employees', 'view_employee_salary'
)
WHERE r.name = 'accountant';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.name IN ('view_expenses', 'view_employees', 'manage_employees')
WHERE r.name = 'manager';

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
