-- VAYRO — Phase 3: Wallet + Ledger core
-- Adds the authoritative running balance column to ledger_accounts.

ALTER TABLE `ledger_accounts`
  ADD COLUMN `balance_minor` BIGINT NOT NULL DEFAULT 0;
