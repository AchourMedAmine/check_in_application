-- Tables owned by the check-in app. Additive only: nothing in `public` is
-- touched, and there are no foreign keys into the website's tables, so the
-- website's Prisma migrations never see these objects.
--
-- Apply with:  npm run db:apply prisma/sql/001_checkin_schema.sql
-- Roll back with: DROP SCHEMA checkin CASCADE;

CREATE SCHEMA IF NOT EXISTS checkin;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'SessionStatus' AND n.nspname = 'checkin'
  ) THEN
    CREATE TYPE checkin."SessionStatus" AS ENUM ('Scheduled', 'Open', 'Closed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS checkin.sessions (
  id                      TEXT PRIMARY KEY,
  title                   TEXT NOT NULL,
  location                TEXT,
  starts_at               TIMESTAMP(3) NOT NULL,
  ends_at                 TIMESTAMP(3) NOT NULL,
  mandatory               BOOLEAN NOT NULL DEFAULT TRUE,
  break_allowance_minutes INTEGER NOT NULL DEFAULT 15,
  penalty_points          INTEGER NOT NULL DEFAULT 5,
  status                  checkin."SessionStatus" NOT NULL DEFAULT 'Scheduled',
  created_at              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sessions_status_starts_at_idx
  ON checkin.sessions (status, starts_at);

CREATE TABLE IF NOT EXISTS checkin.presences (
  id             TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,   -- public.participants.id (no FK on purpose)
  session_id     TEXT NOT NULL,   -- checkin.sessions.id
  check_in_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  check_out_at   TIMESTAMP(3),
  station_id     TEXT
);

CREATE INDEX IF NOT EXISTS presences_session_checkout_idx
  ON checkin.presences (session_id, check_out_at);

CREATE INDEX IF NOT EXISTS presences_participant_session_checkin_idx
  ON checkin.presences (participant_id, session_id, check_in_at);

-- At most ONE open interval per participant per session. This is what makes
-- two doors scanning the same badge simultaneously produce a single row.
CREATE UNIQUE INDEX IF NOT EXISTS presences_one_open_per_participant_session
  ON checkin.presences (participant_id, session_id)
  WHERE check_out_at IS NULL;
