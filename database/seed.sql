-- ==============================================================================
-- SAW MILL MANAGEMENT SYSTEM (TIMBERCRAFT) - DEVELOPMENT SEED SCRIPT
-- Target Database: sawmill_db
-- IMPORTANT:
--   This file contains development seed data and foundational catalogs only.
--   DO NOT run this file in production environments with live financial data.
--   No production secrets or actual passwords are contained in this file.
-- ==============================================================================

USE `sawmill_db`;

SET FOREIGN_KEY_CHECKS = 0;

-- ==============================================================================
-- 1. STANDARD ROLES
-- ==============================================================================
INSERT INTO `roles` (`name`, `description`) VALUES
('owner', 'Primary sawmill owner with comprehensive, unrestricted system authority'),
('admin', 'Authorized administrator managing daily operations, staff, and approvals'),
('manager', 'Yard manager overseeing inventory batches, raw logs, and sawing schedules'),
('operator', 'Sawmill line and bandsaw machine operator tracking cutting jobs'),
('accountant', 'Financial and billing officer managing customer invoices and payments'),
('staff', 'Registered sawmill employee with tailored, role-restricted duties')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- ==============================================================================
-- 2. GRANULAR SYSTEM PERMISSIONS
-- ==============================================================================
INSERT INTO `permissions` (`name`, `module`, `description`) VALUES
-- Users, Admins & Staff
('manage_users', 'users', 'Create and modify user accounts and roles'),
('manage_admins', 'users', 'Create, configure, and deactivate administrator accounts'),
('manage_staff', 'users', 'Review staff registration requests and assign permissions'),
('manage_settings', 'settings', 'Configure business and application settings'),

-- Inventory & Stock
('view_inventory', 'inventory', 'View timber batches and stock levels'),
('view_stock', 'inventory', 'Quick view of current stock counts'),
('manage_inventory', 'inventory', 'Add, adjust, and edit raw logs and sawn batches'),
('view_images', 'inventory', 'View timber batch and wood species images'),

-- Suppliers & Purchases
('view_purchases', 'purchases', 'View supplier timber procurement records'),
('manage_purchases', 'purchases', 'Create, receive, and manage supplier procurement orders'),

-- Sawing & Production
('view_cutting_jobs', 'production', 'View saw orders and blade work logs'),
('manage_cutting_jobs', 'production', 'Create, dispatch, schedule, and complete cutting jobs'),

-- Customers & Sales
('view_customers', 'customers', 'View customer details and order histories'),
('manage_customers', 'customers', 'Create, update, and manage customer records'),
('view_sales_orders', 'sales', 'View customer wholesale and custom sales orders'),
('manage_sales_orders', 'sales', 'Create, confirm, fulfill, and cancel sales orders'),

-- Billing & Invoicing
('view_invoices', 'billing', 'View customer invoices and balance due'),
('manage_invoices', 'billing', 'Create, recalculate, and void customer invoices'),
('view_payments', 'billing', 'View payment records and ledger receipts'),
('manage_payments', 'billing', 'Record receipts and process payment settlements'),

-- Expenses
('view_expenses', 'expenses', 'View operating expenses and expense categories'),
('manage_expenses', 'expenses', 'Record and categorize daily mill expenses'),
('reverse_expenses', 'expenses', 'Authorize expense reversals with an audit explanation'),

-- Employees & HR
('view_employees', 'employees', 'View employee roster and contact details'),
('manage_employees', 'employees', 'Add and update employee workforce records'),
('view_employee_salary', 'employees', 'View confidential wage and compensation details'),
('manage_employee_salary', 'employees', 'Configure employee wage and salary data'),

-- Deliveries & Enquiries
('view_deliveries', 'deliveries', 'View delivery dispatch records and status'),
('manage_deliveries', 'deliveries', 'Schedule drivers and confirm order deliveries'),
('view_enquiries', 'enquiries', 'View public customer quote enquiries'),
('manage_enquiries', 'enquiries', 'Assign, update, and convert customer enquiries'),

-- Documents & Analytics
('view_documents', 'documents', 'View stored transit passes, PDFs, and inspection files'),
('manage_documents', 'documents', 'Upload and organize business and transit documents'),
('view_reports', 'analytics', 'Access executive summaries, recovery yields, and sales metrics'),
('view_finance_reports', 'analytics', 'Access confidential balance sheets and profit & loss reports')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- ==============================================================================
-- 3. ROLE-PERMISSION GRANTS
-- ==============================================================================

-- 3A. OWNER: Complete access to every permission
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name = 'owner';

-- 3B. ADMIN: Operational and staff management
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name IN (
  'manage_users', 'manage_staff', 'view_inventory', 'view_stock', 'manage_inventory',
  'view_images', 'view_purchases', 'manage_purchases', 'view_cutting_jobs', 'manage_cutting_jobs',
  'view_customers', 'manage_customers', 'view_sales_orders', 'manage_sales_orders',
  'view_invoices', 'manage_invoices', 'view_payments', 'manage_payments',
  'view_expenses', 'manage_expenses', 'reverse_expenses',
  'view_employees', 'manage_employees', 'view_employee_salary', 'manage_employee_salary',
  'view_deliveries', 'manage_deliveries', 'view_enquiries', 'manage_enquiries',
  'view_documents', 'manage_documents', 'view_reports', 'view_finance_reports'
)
WHERE r.name = 'admin';

-- 3C. MANAGER: Yard management, inventory, saw scheduling, customer orders, employees
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name IN (
  'view_inventory', 'view_stock', 'manage_inventory', 'view_images',
  'view_purchases', 'view_cutting_jobs', 'manage_cutting_jobs',
  'view_customers', 'manage_customers', 'view_sales_orders', 'manage_sales_orders',
  'view_employees', 'manage_employees', 'view_deliveries', 'manage_deliveries',
  'view_enquiries', 'manage_enquiries', 'view_documents', 'view_reports'
)
WHERE r.name = 'manager';

-- 3D. OPERATOR: Machine line execution, cutting view/progress, stock visibility
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name IN (
  'view_inventory', 'view_stock', 'view_cutting_jobs', 'view_images'
)
WHERE r.name = 'operator';

-- 3E. ACCOUNTANT: Billing, customer settlements, payments, expenses, financial reports
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name IN (
  'view_customers', 'view_sales_orders', 'view_purchases',
  'view_invoices', 'manage_invoices', 'view_payments', 'manage_payments',
  'view_expenses', 'manage_expenses', 'view_employee_salary',
  'view_reports', 'view_finance_reports'
)
WHERE r.name = 'accountant';

-- 3F. STAFF: Safe baseline view for approved general staff members
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name IN (
  'view_stock', 'view_images'
)
WHERE r.name = 'staff';

-- ==============================================================================
-- 7. MASTER BOTANICAL WOOD CATALOGUE & REGIONAL MULTILINGUAL NAMES
-- ==============================================================================
INSERT IGNORE INTO `wood_types`
  (`slug`, `common_name_en`, `scientific_name`, `scientific_name_verified`, `common_name_verified`, `density_kg_m3`, `durability_class`)
VALUES
('teak', 'Teak', 'Tectona grandis', TRUE, TRUE, 660.00, 'Class 1 - Very High'),
('neem', 'Neem', 'Azadirachta indica', TRUE, TRUE, 720.00, 'Class 2 - High'),
('sandalwood', 'Sandalwood', 'Santalum album', TRUE, TRUE, 900.00, 'Class 1 - Very High'),
('eucalyptus', 'Eucalyptus', 'Eucalyptus globulus', TRUE, TRUE, 750.00, 'Class 3 - Moderate'),
('mango', 'Mango', 'Mangifera indica', TRUE, TRUE, 590.00, 'Class 4 - Low'),
('jackfruit', 'Jackfruit', 'Artocarpus heterophyllus', TRUE, TRUE, 640.00, 'Class 2 - High'),
('bamboo', 'Bamboo', 'Bambusa vulgaris', TRUE, TRUE, 700.00, 'Class 3 - Moderate'),
('indian-rosewood', 'Indian Rosewood (Sheesham)', 'Dalbergia latifolia', TRUE, TRUE, 850.00, 'Class 1 - Very High'),
('sal', 'Sal', 'Shorea robusta', TRUE, TRUE, 880.00, 'Class 1 - Very High'),
('deodar', 'Deodar Cedar', 'Cedrus deodara', TRUE, TRUE, 560.00, 'Class 2 - High'),
('pine', 'Pine', 'Pinus roxburghii', TRUE, TRUE, 510.00, 'Class 3 - Moderate'),
('acacia', 'Acacia (Babool)', 'Acacia nilotica', TRUE, TRUE, 830.00, 'Class 2 - High'),
('casuarina', 'Casuarina', 'Casuarina equisetifolia', TRUE, TRUE, 790.00, 'Class 3 - Moderate'),
('mahogany', 'Mahogany', 'Swietenia mahagoni', TRUE, TRUE, 650.00, 'Class 2 - High'),
('silver-oak', 'Silver Oak', 'Grevillea robusta', TRUE, TRUE, 580.00, 'Class 3 - Moderate'),
('tamarind', 'Tamarind', 'Tamarindus indica', TRUE, TRUE, 910.00, 'Class 1 - Very High');

-- Multilingual regional names (Kannada, Hindi, Telugu, Tamil)
INSERT IGNORE INTO `wood_names` (`wood_type_id`, `language_code`, `name`, `name_kind`, `verified`)
SELECT wt.id, names.language_code, names.name, 'preferred', TRUE
FROM (
  SELECT 'teak' slug, 'kn' language_code, 'ತೇಗ' name UNION ALL
  SELECT 'teak', 'hi', 'सागौन' UNION ALL SELECT 'teak', 'te', 'టేకు' UNION ALL SELECT 'teak', 'ta', 'தேக்கு' UNION ALL
  SELECT 'neem', 'kn', 'ಬೇವು' UNION ALL SELECT 'neem', 'hi', 'नीम' UNION ALL SELECT 'neem', 'te', 'వేప' UNION ALL SELECT 'neem', 'ta', 'வேம்பு' UNION ALL
  SELECT 'sandalwood', 'kn', 'ಶ್ರೀಗಂಧ' UNION ALL SELECT 'sandalwood', 'hi', 'चंदन' UNION ALL SELECT 'sandalwood', 'te', 'చందనం' UNION ALL SELECT 'sandalwood', 'ta', 'சந்தனம்' UNION ALL
  SELECT 'eucalyptus', 'kn', 'ನೀಲಗಿರಿ' UNION ALL SELECT 'eucalyptus', 'hi', 'नीलगिरी' UNION ALL SELECT 'eucalyptus', 'te', 'యూకలిప్టస్' UNION ALL SELECT 'eucalyptus', 'ta', 'யூகலிப்டஸ்' UNION ALL
  SELECT 'mango', 'kn', 'ಮಾವು' UNION ALL SELECT 'mango', 'hi', 'आम' UNION ALL SELECT 'mango', 'te', 'మామిడి' UNION ALL SELECT 'mango', 'ta', 'மாமரம்' UNION ALL
  SELECT 'jackfruit', 'kn', 'ಹಲಸು' UNION ALL SELECT 'jackfruit', 'hi', 'कटहल' UNION ALL SELECT 'jackfruit', 'te', 'పనస' UNION ALL SELECT 'jackfruit', 'ta', 'பலா' UNION ALL
  SELECT 'bamboo', 'kn', 'ಬಿದಿರು' UNION ALL SELECT 'bamboo', 'hi', 'बाँस' UNION ALL SELECT 'bamboo', 'te', 'వెదురు' UNION ALL SELECT 'bamboo', 'ta', 'மூங்கில்' UNION ALL
  SELECT 'indian-rosewood', 'kn', 'ಬೀಟೆ' UNION ALL SELECT 'indian-rosewood', 'hi', 'शीशम' UNION ALL SELECT 'indian-rosewood', 'te', 'రోజ్ వుడ్' UNION ALL SELECT 'indian-rosewood', 'ta', 'ஈட்டி' UNION ALL
  SELECT 'sal', 'kn', 'ಸಾಲ್' UNION ALL SELECT 'sal', 'hi', 'साल' UNION ALL SELECT 'sal', 'te', 'సాల' UNION ALL SELECT 'sal', 'ta', 'சால்' UNION ALL
  SELECT 'pine', 'kn', 'ಪೈನ್' UNION ALL SELECT 'pine', 'hi', 'चीड़' UNION ALL SELECT 'pine', 'te', 'పైన్' UNION ALL SELECT 'pine', 'ta', 'பைன்'
) AS names
JOIN `wood_types` wt ON wt.slug = names.slug;

-- ==============================================================================
-- 8. STANDARD PRODUCTS (STANDARDIZED LUMBER OFFERINGS)
-- ==============================================================================
INSERT IGNORE INTO `products`
  (`product_code`, `name`, `slug`, `wood_type_id`, `timber_type`, `category`, `grade`, `dimensions_text`, `thickness_inches`, `width_inches`, `length_feet`, `unit`, `unit_price`, `is_active`)
SELECT
  'PRD-TEAK-2X4-10', 'Teak Dimensional Timber 2"x4"x10\'', 'teak-dimensional-2x4-10',
  wt.id, 'sawn_timber', 'Dimensional Lumber', 'Select Structural', '2" x 4" x 10 ft', 2.00, 4.00, 10.00, 'CFT', 2850.00, TRUE
FROM `wood_types` wt WHERE wt.slug = 'teak';

INSERT IGNORE INTO `products`
  (`product_code`, `name`, `slug`, `wood_type_id`, `timber_type`, `category`, `grade`, `dimensions_text`, `thickness_inches`, `width_inches`, `length_feet`, `unit`, `unit_price`, `is_active`)
SELECT
  'PRD-TEAK-1X6-12', 'Teak Planks 1"x6"x12\'', 'teak-planks-1x6-12',
  wt.id, 'sawn_timber', 'Planks', 'Grade A', '1" x 6" x 12 ft', 1.00, 6.00, 12.00, 'CFT', 2950.00, TRUE
FROM `wood_types` wt WHERE wt.slug = 'teak';

INSERT IGNORE INTO `products`
  (`product_code`, `name`, `slug`, `wood_type_id`, `timber_type`, `category`, `grade`, `dimensions_text`, `thickness_inches`, `width_inches`, `length_feet`, `unit`, `unit_price`, `is_active`)
SELECT
  'PRD-NEEM-4X4-12', 'Neem Structural Beams 4"x4"x12\'', 'neem-structural-4x4-12',
  wt.id, 'sawn_timber', 'Structural Beams', 'Select & Better', '4" x 4" x 12 ft', 4.00, 4.00, 12.00, 'CFT', 1450.00, TRUE
FROM `wood_types` wt WHERE wt.slug = 'neem';

INSERT IGNORE INTO `products`
  (`product_code`, `name`, `slug`, `wood_type_id`, `timber_type`, `category`, `grade`, `dimensions_text`, `thickness_inches`, `width_inches`, `length_feet`, `unit`, `unit_price`, `is_active`)
SELECT
  'PRD-ROSE-LIVE-10', 'Indian Rosewood Live Edge Slab 3"x24"x10\'', 'rosewood-live-edge-3x24-10',
  wt.id, 'sawn_timber', 'Live Edge Slabs', 'Cabinet Grade', '3" x 24" x 10 ft', 3.00, 24.00, 10.00, 'CFT', 4200.00, TRUE
FROM `wood_types` wt WHERE wt.slug = 'indian-rosewood';

-- ==============================================================================
-- 20. EXPENSE CATEGORIES
-- ==============================================================================
INSERT INTO `expense_categories` (`name`, `is_active`) VALUES
('Electricity & Utility', TRUE),
('Labour & Mill Wages', TRUE),
('Fuel & Diesel (Generator / Forklift)', TRUE),
('Machine Maintenance & Blade Sharpening', TRUE),
('Transport & Vehicle Freight', TRUE),
('Safety & Yard Supplies', TRUE),
('Administrative & Office', TRUE),
('Other Operating Expense', TRUE)
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

-- ==============================================================================
-- SEQUENCES & SYSTEM CONFIGURATION
-- ==============================================================================
INSERT INTO `billing_sequences` (`sequence_name`, `last_value`) VALUES
('invoice_seq', 100),
('payment_seq', 100),
('sales_order_seq', 100),
('cutting_job_seq', 100),
('purchase_seq', 100),
('delivery_seq', 100)
ON DUPLICATE KEY UPDATE `last_value` = `last_value`;

INSERT INTO `reporting_settings` (`id`, `inventory_costing_method`)
VALUES (1, 'fifo')
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);

-- ==============================================================================
-- DEVELOPMENT-ONLY SAMPLE DATA (CLEARLY MARKED - DO NOT USE IN PRODUCTION)
-- ==============================================================================

-- Sample Employees for testing
INSERT IGNORE INTO `employees`
  (`id`, `employee_code`, `name`, `phone`, `email`, `job_title`, `department`, `joining_date`, `salary`, `salary_period`, `status`)
VALUES
(1, 'EMP-001', 'Ramesh Kumar', '+91 98765 43210', 'ramesh.kumar@example.com', 'Head Sawyer & Line Supervisor', 'Operations', '2023-01-15', 38000.00, 'monthly', 'active'),
(2, 'EMP-002', 'Suresh Patel', '+91 98765 43211', 'suresh.patel@example.com', 'Yard Log Inspector', 'Log Yard', '2023-04-01', 32000.00, 'monthly', 'active'),
(3, 'EMP-003', 'Ananya Sharma', '+91 98765 43212', 'ananya.sharma@example.com', 'Accounts & Billing Officer', 'Finance', '2023-06-10', 35000.00, 'monthly', 'active');

-- Development Test Users:
-- Hash below corresponds to standard dev password 'Admin@123' (bcrypt 10 rounds)
-- For development and local testing only. Never deploy default hashes to production.
INSERT IGNORE INTO `users`
  (`id`, `username`, `email`, `password_hash`, `role_id`, `employee_id`, `status`, `phone`)
SELECT
  1, 'owner_dev', 'owner@example.local',
  '$2a$10$w8.LszVj43.Yj531B5zX5eE8e/KzGz5yG7F90o2eE5e7fG8h.J1k2',
  r.id, 1, 'active', '+91 98765 43210'
FROM `roles` r WHERE r.name = 'owner';

INSERT IGNORE INTO `users`
  (`id`, `username`, `email`, `password_hash`, `role_id`, `employee_id`, `status`, `phone`)
SELECT
  2, 'accountant_dev', 'accountant@example.local',
  '$2a$10$w8.LszVj43.Yj531B5zX5eE8e/KzGz5yG7F90o2eE5e7fG8h.J1k2',
  r.id, 3, 'active', '+91 98765 43212'
FROM `roles` r WHERE r.name = 'accountant';

-- Sample Development Customers
INSERT IGNORE INTO `customers`
  (`id`, `customer_code`, `name`, `contact_person`, `company_name`, `email`, `phone`, `type`, `city`, `credit_limit`, `payment_terms`, `status`)
VALUES
(1, 'CUST-001', 'Kavitha Furniture Works', 'Rajesh Rao', 'Kavitha Fine Woods Pvt Ltd', 'rajesh@kavithafurniture.example', '+91 98450 11223', 'Commercial Contractor', 'Bengaluru', 200000.00, 'Net 30', 'Active'),
(2, 'CUST-002', 'Heritage Timber Interiors', 'Priya Menon', 'Heritage Homes & Interiors', 'priya@heritagetimber.example', '+91 98450 44556', 'Architectural Firm', 'Mysuru', 150000.00, 'Net 15', 'Active');

-- Sample Development Suppliers
INSERT IGNORE INTO `suppliers`
  (`id`, `supplier_code`, `company_name`, `rep_name`, `phone`, `email`, `region`, `specialty`, `payment_terms`, `status`, `rating`)
VALUES
(1, 'SUP-001', 'Western Ghats Forestry Corp', 'Mohan Das', '+91 98440 99887', 'mohan@wghatsforestry.example', 'Karnataka Concessions', 'Teak & Neem Round Logs', 'Net 30 Days', 'Active', 4.8),
(2, 'SUP-002', 'Malnad Plantation Lumber', 'Vikram Gowda', '+91 98440 66778', 'vikram@malnadplantation.example', 'Shimoga Forest Belt', 'Eucalyptus & Silver Oak Logs', 'Net 15 Days', 'Active', 4.6);

-- Sample Development Timber Batches:
-- Raw logs and finished sawn lumber, distinguishing mill-owned stock from customer-owned timber held for sawing.
INSERT IGNORE INTO `timber_batches`
  (`id`, `batch_code`, `name`, `wood_type_id`, `timber_type`, `category`, `species`, `grade`, `dimensions_text`, `length_feet`, `width_inches`, `thickness_inches`, `girth_inches`, `unit`, `pieces_count`, `calculated_volume_cbf`, `calculated_board_feet`, `quantity_total`, `quantity_available`, `ownership`, `customer_id`, `supplier_id`, `status`, `yard_location`, `cost_price`, `selling_price`)
SELECT
  1, 'BATCH-RAW-TEAK-001', 'Teak Prime Round Logs 14ft', wt.id, 'raw_log', 'Round Logs', 'Teak', 'Prime Log Grade', '14 ft x 48" girth', 14.00, 0.00, 0.00, 48.00, 'CFT', 10, 140.000, 0.000, 140.000, 140.000, 'mill', NULL, 1, 'In Stock', 'Log Yard Bay 1', 1900.00, 2500.00
FROM `wood_types` wt WHERE wt.slug = 'teak';

INSERT IGNORE INTO `timber_batches`
  (`id`, `batch_code`, `name`, `wood_type_id`, `timber_type`, `category`, `species`, `grade`, `dimensions_text`, `length_feet`, `width_inches`, `thickness_inches`, `girth_inches`, `unit`, `pieces_count`, `calculated_volume_cbf`, `calculated_board_feet`, `quantity_total`, `quantity_available`, `ownership`, `customer_id`, `supplier_id`, `status`, `yard_location`, `cost_price`, `selling_price`)
SELECT
  2, 'BATCH-SAWN-TEAK-002', 'Teak Sawn Lumber 2"x4"x10ft', wt.id, 'sawn_timber', 'Dimensional Lumber', 'Teak', 'Select Structural', '2" x 4" x 10 ft', 10.00, 4.00, 2.00, 0.00, 'CFT', 50, 27.778, 333.333, 27.778, 27.778, 'mill', NULL, NULL, 'In Stock', 'Shed A - Rack 3', 2100.00, 2850.00
FROM `wood_types` wt WHERE wt.slug = 'teak';

-- Customer-owned raw timber held at mill for custom milling
INSERT IGNORE INTO `timber_batches`
  (`id`, `batch_code`, `name`, `wood_type_id`, `timber_type`, `category`, `species`, `grade`, `dimensions_text`, `length_feet`, `width_inches`, `thickness_inches`, `girth_inches`, `unit`, `pieces_count`, `calculated_volume_cbf`, `calculated_board_feet`, `quantity_total`, `quantity_available`, `ownership`, `customer_id`, `supplier_id`, `status`, `yard_location`, `cost_price`, `selling_price`)
SELECT
  3, 'BATCH-CUST-JACK-003', 'Customer Jackfruit Logs for Custom Milling', wt.id, 'raw_log', 'Round Logs', 'Jackfruit', 'Customer Timber', '12 ft x 40" girth', 12.00, 0.00, 0.00, 40.00, 'CFT', 4, 33.333, 0.000, 33.333, 33.333, 'customer', 1, NULL, 'In Stock', 'Customer Timber Bay C', 0.00, 0.00
FROM `wood_types` wt WHERE wt.slug = 'jackfruit';

-- Initial stock movement audit records for sample batches
INSERT IGNORE INTO `stock_movements`
  (`movement_number`, `batch_id`, `movement_type`, `quantity`, `previous_quantity`, `new_quantity`, `unit`, `source_transaction_type`, `source_transaction_id`, `reason`)
VALUES
('MOV-INIT-001', 1, 'receipt', 140.000, 0.000, 140.000, 'CFT', 'initial_intake', 'SYS-INIT', 'Initial yard intake of Teak round logs from Western Ghats Forestry'),
('MOV-INIT-002', 2, 'receipt', 27.778, 0.000, 27.778, 'CFT', 'initial_intake', 'SYS-INIT', 'Finished sawn lumber intake into Shed A Rack 3'),
('MOV-INIT-003', 3, 'receipt', 33.333, 0.000, 33.333, 'CFT', 'initial_intake', 'SYS-INIT', 'Intake of customer-owned Jackfruit logs for custom milling order');

SET FOREIGN_KEY_CHECKS = 1;
