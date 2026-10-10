-- The people allowed to use the scanner, replacing the shared STAFF_PIN.
-- Scanners scan badges; Managers can also open and close sessions.
-- Accounts are created with `npm run scanners -- add ...`, never by hand:
-- the password must be hashed by the app.
--
-- Apply with:  npm run db:apply prisma/sql/004_scanners.sql
-- Roll back:   ALTER TABLE checkin.presences DROP COLUMN check_in_scanner_id,
--                                            DROP COLUMN check_out_scanner_id;
--              DROP TABLE checkin.scanners;
--              DROP TYPE checkin."ScannerRole";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ScannerRole' AND n.nspname = 'checkin'
  ) THEN
    CREATE TYPE checkin."ScannerRole" AS ENUM ('Scanner', 'Manager');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS checkin.scanners (
  id               TEXT PRIMARY KEY,
  -- Stored lower-case, so "Amine" and "amine" are the same account.
  username         TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  -- scrypt$N$r$p$salt$hash — see lib/password.ts.
  password_hash    TEXT NOT NULL,
  role             checkin."ScannerRole" NOT NULL DEFAULT 'Scanner',
  -- false locks the account out on its very next request.
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Baked into the cookie. Bumping it (password reset) signs the account
  -- out on every device.
  session_version  INTEGER NOT NULL DEFAULT 0,
  -- Brute-force lockout: 5 wrong passwords lock the account for 15 minutes.
  failed_logins    INTEGER NOT NULL DEFAULT 0,
  locked_until     TIMESTAMP(3),
  last_login_at    TIMESTAMP(3),
  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT scanners_username_key UNIQUE (username)
);

-- Who moved a participant: the scanner behind the check-in, and the one
-- behind the check-out (often a different door). No FK, like the rest of
-- the schema; NULL on rows recorded before accounts existed.
ALTER TABLE checkin.presences
  ADD COLUMN IF NOT EXISTS check_in_scanner_id  TEXT,
  ADD COLUMN IF NOT EXISTS check_out_scanner_id TEXT;
