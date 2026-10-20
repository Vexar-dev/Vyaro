-- VAYRO — initial schema (Phase 2)
-- MySQL 8+ / InnoDB. All monetary columns are BIGINT (minor units) — never FLOAT/DOUBLE.
-- NOTE: this file was authored by hand against schema.prisma because no live MySQL instance
-- was reachable in the generation sandbox. Before first real deploy, run:
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- and diff the output against this file to catch any drift, then `prisma migrate deploy`.

CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `username` VARCHAR(32) NOT NULL,
  `username_lower` VARCHAR(32) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `phone` VARCHAR(32) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `status` ENUM('PENDING','ACTIVE','FROZEN','BANNED') NOT NULL DEFAULT 'PENDING',
  `email_verified_at` DATETIME(3) NULL,
  `phone_verified_at` DATETIME(3) NULL,
  `two_factor_enabled` BOOLEAN NOT NULL DEFAULT false,
  `failed_login_count` INT NOT NULL DEFAULT 0,
  `locked_until` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_public_id_key` (`public_id`),
  UNIQUE KEY `users_username_key` (`username`),
  UNIQUE KEY `users_username_lower_key` (`username_lower`),
  UNIQUE KEY `users_email_key` (`email`),
  UNIQUE KEY `users_phone_key` (`phone`),
  KEY `users_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `user_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `full_name` VARCHAR(191) NULL,
  `avatar_url` VARCHAR(512) NULL,
  `locale` VARCHAR(8) NOT NULL DEFAULT 'ar',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_profiles_user_id_key` (`user_id`),
  CONSTRAINT `user_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` ENUM('USER','SUPPORT','ADMIN','SUPER_ADMIN') NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(128) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `role_permissions` (
  `role_id` BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `user_roles` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role_id` BIGINT UNSIGNED NOT NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `role_id`),
  CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `refresh_token_hash` CHAR(64) NOT NULL,
  `device_name` VARCHAR(191) NULL,
  `user_agent` VARCHAR(512) NULL,
  `ip_address` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `replaced_by_session_id` BIGINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessions_public_id_key` (`public_id`),
  KEY `sessions_user_id_idx` (`user_id`),
  KEY `sessions_expires_at_idx` (`expires_at`),
  CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `password_reset_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_tokens_token_hash_key` (`token_hash`),
  CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `two_factor_secrets` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `encrypted_secret` TEXT NOT NULL,
  `confirmed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `two_factor_secrets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `reserved_usernames` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(32) NOT NULL,
  `reason` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `reserved_usernames_username_key` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `username_change_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `old_username` VARCHAR(32) NOT NULL,
  `new_username` VARCHAR(32) NOT NULL,
  `changed_by` BIGINT UNSIGNED NULL,
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `username_change_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Wallet / Ledger (carried forward from Phase 1, holds added) ──

CREATE TABLE `assets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(16) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `decimals` INT NOT NULL DEFAULT 2,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `assets_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `wallets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallets_user_id_key` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `wallet_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `wallet_id` BIGINT UNSIGNED NOT NULL,
  `asset_id` BIGINT UNSIGNED NOT NULL,
  `available_minor` BIGINT NOT NULL DEFAULT 0,
  `held_minor` BIGINT NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_accounts_wallet_id_asset_id_key` (`wallet_id`, `asset_id`),
  CONSTRAINT `wallet_accounts_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE,
  CONSTRAINT `wallet_accounts_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `ledger_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_type` ENUM('USER','SYSTEM','PROVIDER','FEE_POOL') NOT NULL,
  `owner_id` BIGINT UNSIGNED NULL,
  `asset_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ledger_accounts_owner_asset_key` (`owner_type`, `owner_id`, `asset_id`),
  CONSTRAINT `ledger_accounts_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `type` ENUM('TRANSFER','CONVERSION','DEPOSIT','WITHDRAWAL','FEE','REFUND','ORDER') NOT NULL,
  `status` ENUM('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED','REFUNDING','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `idempotency_key` VARCHAR(191) NOT NULL,
  `reference_id` VARCHAR(191) NULL,
  `initiated_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transactions_public_id_key` (`public_id`),
  UNIQUE KEY `transactions_idempotency_key_key` (`idempotency_key`),
  KEY `transactions_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `ledger_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ledger_account_id` BIGINT UNSIGNED NOT NULL,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `direction` ENUM('DEBIT','CREDIT') NOT NULL,
  `amount_minor` BIGINT NOT NULL,
  `balance_after` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ledger_entries_ledger_account_id_idx` (`ledger_account_id`),
  CONSTRAINT `ledger_entries_ledger_account_id_fkey` FOREIGN KEY (`ledger_account_id`) REFERENCES `ledger_accounts`(`id`),
  CONSTRAINT `ledger_entries_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `transaction_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `transaction_events_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Providers (lifecycle: ACTIVE → DISABLED → ARCHIVED; never hard-deleted once referenced) ──

CREATE TABLE `providers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `status` ENUM('ACTIVE','DISABLED','ARCHIVED') NOT NULL DEFAULT 'DISABLED',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `providers_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `provider_credentials` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider_id` BIGINT UNSIGNED NOT NULL,
  `key_name` VARCHAR(128) NOT NULL,
  `encrypted_value` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `provider_credentials_provider_id_key_name_key` (`provider_id`, `key_name`),
  -- ON DELETE RESTRICT: a provider with stored credentials cannot be hard-deleted (see PART 1 §1)
  CONSTRAINT `provider_credentials_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Audit ──

CREATE TABLE `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_id` BIGINT UNSIGNED NULL,
  `action` VARCHAR(128) NOT NULL,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(64) NULL,
  `ip_address` VARCHAR(64) NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `audit_logs_entity_type_entity_id_idx` (`entity_type`, `entity_id`),
  CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
