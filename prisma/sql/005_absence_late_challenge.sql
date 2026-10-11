-- The congress rules beyond over-long breaks (5 points per offence):
--   Absent  — expected at a session and never scanned (charged at close)
--   Late    — first scan more than 10 minutes after the start
-- and the exception: anyone with a technical challenge at the same time is
-- excused from the session. Challenge slots are sessions flagged
-- `challenge`; their roster is who is excused from overlapping sessions.
--
-- Additive only, nothing in `public` is touched. Needs Postgres 15+
-- (NULLS NOT DISTINCT); on an older server the whole file fails and
-- nothing is applied.
--
-- Apply with:  npm run db:apply prisma/sql/005_absence_late_challenge.sql
-- Roll back:   DROP INDEX checkin.penalties_one_per_offence;
--              ALTER TABLE checkin.sessions DROP COLUMN opened_at, DROP COLUMN challenge;
--              (enum values cannot be dropped; unused ones are harmless)

ALTER TYPE checkin."PenaltyReason" ADD VALUE IF NOT EXISTS 'Absent';
ALTER TYPE checkin."PenaltyReason" ADD VALUE IF NOT EXISTS 'Late';

-- An absence has no attendance interval to hang off.
ALTER TABLE checkin.penalties ALTER COLUMN presence_id DROP NOT NULL;

-- One penalty per offence. The existing UNIQUE (presence_id, reason) covers
-- breaks and lateness; this also covers absences, whose presence_id is NULL
-- — NULLS NOT DISTINCT makes a second absence for the same participant and
-- session a conflict, so closing twice can never charge it twice.
CREATE UNIQUE INDEX IF NOT EXISTS penalties_one_per_offence
  ON checkin.penalties (session_id, participant_id, reason, presence_id)
  NULLS NOT DISTINCT;

ALTER TABLE checkin.sessions
  -- When a manager first opened the session. Lateness counts from the start
  -- time or from this, whichever is later: nobody is late because the doors
  -- opened late.
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP(3),
  -- A technical-challenge slot: its roster is excused from every session
  -- that overlaps it.
  ADD COLUMN IF NOT EXISTS challenge BOOLEAN NOT NULL DEFAULT FALSE;
