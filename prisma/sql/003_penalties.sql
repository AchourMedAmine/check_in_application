-- One row per over-long break. Append-only: the SB leaderboard is
-- SUM(points) GROUP BY sb over this table.
--
-- Apply with:  npm run db:apply prisma/sql/003_penalties.sql
-- Roll back:   DROP TABLE checkin.penalties;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'PenaltyReason' AND n.nspname = 'checkin'
  ) THEN
    CREATE TYPE checkin."PenaltyReason" AS ENUM ('OverBreak', 'LeftEarly');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS checkin.penalties (
  id             TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,          -- public.participants.id (no FK on purpose)
  session_id     TEXT NOT NULL,          -- checkin.sessions.id

  -- The interval this penalty hangs off: for OverBreak, the one whose
  -- check-in ENDED the break; for LeftEarly, the one they left from.
  -- One interval can be both (a penalised re-entry that is also the last
  -- one), hence the key is (presence_id, reason) rather than presence_id.
  presence_id    TEXT NOT NULL,

  -- Snapshots, deliberately NOT joined at read time: a penalty is a
  -- historical fact. Correcting a participant's branch later, or editing a
  -- session's penalty_points, must not silently rewrite past deductions.
  sb             public."SB",            -- NULL when the participant has no branch
  break_minutes  INTEGER NOT NULL,
  points         INTEGER NOT NULL,

  -- Charged on re-entry, or at ends_at when the session was closed.
  reason         checkin."PenaltyReason" NOT NULL DEFAULT 'OverBreak',
  created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Idempotency: a retried request, a double scan, or re-running
  -- "close session" can never bill the same break twice.
  UNIQUE (presence_id, reason)
);

CREATE INDEX IF NOT EXISTS penalties_sb_idx ON checkin.penalties (sb);
CREATE INDEX IF NOT EXISTS penalties_session_idx ON checkin.penalties (session_id);
CREATE INDEX IF NOT EXISTS penalties_participant_idx ON checkin.penalties (participant_id);
