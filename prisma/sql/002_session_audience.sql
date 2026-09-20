-- Sessions differ in WHO is expected:
--   Everyone  → the Opening Ceremony: all participants must attend.
--   Assigned  → a workshop: only the participants listed in
--               checkin.session_participants, which the TRSYP website will
--               populate once participants can pick their workshops.
--
-- Apply with:  npm run db:apply prisma/sql/002_session_audience.sql
-- Roll back:   ALTER TABLE checkin.sessions DROP COLUMN audience;
--              DROP TABLE checkin.session_participants;
--              DROP TYPE checkin."Audience";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'Audience' AND n.nspname = 'checkin'
  ) THEN
    CREATE TYPE checkin."Audience" AS ENUM ('Everyone', 'Assigned');
  END IF;
END
$$;

ALTER TABLE checkin.sessions
  ADD COLUMN IF NOT EXISTS audience checkin."Audience" NOT NULL DEFAULT 'Everyone';

-- The expected roster for an Assigned session. Empty for Everyone sessions.
CREATE TABLE IF NOT EXISTS checkin.session_participants (
  session_id     TEXT NOT NULL,
  participant_id TEXT NOT NULL,   -- public.participants.id (no FK on purpose)
  added_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, participant_id)
);

-- "which sessions is this participant expected at?"
CREATE INDEX IF NOT EXISTS session_participants_participant_idx
  ON checkin.session_participants (participant_id);
