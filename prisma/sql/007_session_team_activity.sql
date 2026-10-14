-- Links a session to a team activity on the TRSYP website (FABLAB,
-- COMPETITION, CHALLENGE). Its roster is then every member of a selected
-- team of that activity, read live from public.teams/team_memberships —
-- plus anyone listed in checkin.session_participants. Read-only towards
-- `public`: nothing there is changed.
--
-- Apply with:  npm run db:apply prisma/sql/007_session_team_activity.sql
-- Roll back:   ALTER TABLE checkin.sessions DROP COLUMN team_activity;

ALTER TABLE checkin.sessions
  ADD COLUMN IF NOT EXISTS team_activity TEXT;
