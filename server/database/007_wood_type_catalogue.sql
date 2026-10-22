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
