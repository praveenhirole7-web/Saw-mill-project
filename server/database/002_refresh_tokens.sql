-- Legacy migration: add refresh_tokens for databases created before the
-- current schema.sql. The current schema already includes this table.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hex of the refresh JWT
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rt_user   (user_id),
  INDEX idx_rt_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scheduled cleanup of expired tokens (run manually or via event scheduler)
-- DELETE FROM refresh_tokens WHERE expires_at < NOW();
