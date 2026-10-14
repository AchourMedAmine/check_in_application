-- Which sessions each officer scans. An officer only sees, scans into and
-- reads the roster of their assigned sessions, so nobody picks the wrong
-- door from a list. Managers are not limited.
-- Managed with `npm run scanners -- assign <username> "<session>"`.
--
-- Additive only, nothing in `public` is touched.
-- Apply with:  npm run db:apply prisma/sql/006_scanner_assignments.sql
-- Roll back:   DROP TABLE checkin.scanner_assignments;

CREATE TABLE IF NOT EXISTS checkin.scanner_assignments (
  scanner_id  TEXT NOT NULL,   -- checkin.scanners.id
  session_id  TEXT NOT NULL,   -- checkin.sessions.id
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scanner_id, session_id)
);

-- "who covers this session?"
CREATE INDEX IF NOT EXISTS scanner_assignments_session_idx
  ON checkin.scanner_assignments (session_id);
