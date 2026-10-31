-- Per-account staff permission overrides. Existing accounts keep their role grants
-- until an administrator explicitly assigns per-user permissions.
SET @employee_id_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'employee_id'
);
SET @employee_id_sql = IF(@employee_id_exists = 0,
  'ALTER TABLE users ADD COLUMN employee_id INT UNSIGNED NULL, ADD INDEX idx_users_employee_id (employee_id)',
  'SELECT 1');
PREPARE employee_id_stmt FROM @employee_id_sql;
EXECUTE employee_id_stmt;
DEALLOCATE PREPARE employee_id_stmt;

SET @token_version_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'token_version'
);
SET @token_version_sql = IF(@token_version_exists = 0,
  'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE token_version_stmt FROM @token_version_sql;
EXECUTE token_version_stmt;
DEALLOCATE PREPARE token_version_stmt;

-- Enforce one login per employee where the legacy data has no collisions.
-- Existing duplicate links are left untouched for an operator to review; the
-- API rejects new links while those records are being cleaned up.
SET @employee_unique_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'uq_users_employee_id'
);
SET @employee_duplicates = (
  SELECT COUNT(*) FROM (
    SELECT employee_id FROM users WHERE employee_id IS NOT NULL GROUP BY employee_id HAVING COUNT(*) > 1
  ) duplicate_employee_links
);
SET @employee_unique_sql = IF(@employee_unique_exists = 0 AND @employee_duplicates = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_employee_id (employee_id)',
  'SELECT 1');
PREPARE employee_unique_stmt FROM @employee_unique_sql;
EXECUTE employee_unique_stmt;
DEALLOCATE PREPARE employee_unique_stmt;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_permission_settings (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_permission_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS revoked_access_tokens (
  token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_revoked_access_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (name, module, description) VALUES
('view_purchases', 'purchases', 'View purchase records'),
('view_customers', 'customers', 'View customer details'),
('view_cutting_jobs', 'production', 'View assigned cutting work'),
('view_sales_orders', 'sales', 'View assigned customer orders'),
('view_invoices', 'billing', 'View invoices'),
('view_payments', 'billing', 'View payment records'),
('manage_payments', 'billing', 'Record and manage payments')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.name = 'admin';

-- New staff accounts begin with only the explicitly assigned grants. For a safe
-- default convenience, existing operator accounts can view inventory and cutting.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.name = 'operator' AND p.name IN ('view_inventory', 'view_cutting_jobs');

-- Ownership and approval workflow. Existing administrator grants are preserved;
-- new admins receive per-account overrides through the application.
INSERT INTO roles (name, description) VALUES ('owner', 'Primary sawmill owner with full control')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO permissions (name, module, description) VALUES
('manage_staff', 'users', 'Review staff registration requests and manage staff access'),
('manage_admins', 'users', 'Create, configure, and deactivate administrator accounts'),
('manage_settings', 'settings', 'Manage business settings'),
('view_stock', 'inventory', 'View current stock'),
('view_images', 'inventory', 'View product and stock images'),
('view_finance_reports', 'analytics', 'View financial reports')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'owner';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name = 'manage_staff' WHERE r.name = 'admin';

SET @user_status_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'status') > 0,
  "ALTER TABLE users MODIFY status ENUM('active','inactive','suspended','pending','rejected') NOT NULL DEFAULT 'active'",
  'SELECT 1'
);
PREPARE user_status_stmt FROM @user_status_sql;
EXECUTE user_status_stmt;
DEALLOCATE PREPARE user_status_stmt;

CREATE TABLE IF NOT EXISTS staff_registration_requests (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  contact_email VARCHAR(150) NULL,
  department VARCHAR(120) NOT NULL,
  request_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by_id INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_registration_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_registration_reviewer FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_staff_registration_status_created (request_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
