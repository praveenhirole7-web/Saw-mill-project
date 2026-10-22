-- Preserve existing issued bills while saving language and item measurements for new bills.
ALTER TABLE `invoices`
  MODIFY COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN `language_code` VARCHAR(10) NOT NULL DEFAULT 'en' AFTER `currency`,
  ADD COLUMN `cutting_charge` DECIMAL(14, 2) NOT NULL DEFAULT 0.00 AFTER `additional_charges`;

ALTER TABLE `invoice_items`
  ADD COLUMN `wood_type_id` INT UNSIGNED NULL AFTER `invoice_id`,
  ADD COLUMN `localized_description` VARCHAR(255) NULL AFTER `description`,
  ADD COLUMN `dimensions_text` VARCHAR(255) NULL AFTER `localized_description`,
  ADD CONSTRAINT `fk_invoice_items_wood_type`
    FOREIGN KEY (`wood_type_id`) REFERENCES `wood_types`(`id`) ON DELETE SET NULL;
