-- Makes users.phone and users.shamcash_address IMMUTABLE at the database level, so no code path
-- (a bug, an admin script, a future endpoint) can ever change a user's payout destination.
-- Idempotent. Apply AFTER `prisma migrate` has created the columns:
--   npm run db:triggers        (see package.json)
-- `<=>` is MySQL's NULL-safe equality.
DROP TRIGGER IF EXISTS `users_phone_immutable`;
DROP TRIGGER IF EXISTS `users_payout_identifiers_immutable`;
CREATE TRIGGER `users_payout_identifiers_immutable` BEFORE UPDATE ON `users`
FOR EACH ROW
IF NOT (NEW.`phone` <=> OLD.`phone`) OR NOT (NEW.`shamcash_address` <=> OLD.`shamcash_address`) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'users.phone / users.shamcash_address are immutable';
END IF;
