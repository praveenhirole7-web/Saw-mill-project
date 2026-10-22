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
