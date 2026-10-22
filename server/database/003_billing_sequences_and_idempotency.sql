-- Run once on databases initialized before billing sequence allocation was added.
CREATE TABLE IF NOT EXISTS `billing_sequences` (
  `sequence_name` VARCHAR(32) NOT NULL PRIMARY KEY,
  `last_value` BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `customer_payments`
  ADD COLUMN `idempotency_key` VARCHAR(100) NULL UNIQUE AFTER `transaction_reference`,
  ADD COLUMN `balance_after` DECIMAL(14, 2) NULL AFTER `idempotency_key`;
