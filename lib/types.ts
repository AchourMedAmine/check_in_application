import type {
  Participant as ParticipantRow,
  Penalty,
  Presence,
  Session,
  User,
} from "@/generated/prisma/client";
import type { ScanAction, SessionStats } from "@/lib/attendance/scan";
import type { BreakEvaluation } from "@/lib/attendance/evaluate-break";

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Participant joined with the identity fields that live on `users`. */
export type Participant = ParticipantRow & {
  user: Pick<User, "id" | "email" | "name" | "lastName">;
};

export interface ScanQRInput {
  /** Raw QR content. For the MVP this is the participant id. */
  qrCode: string;
  /** Defaults to the session currently marked Open. */
  sessionId?: string;
  /** Free-text station/door label. */
  stationId?: string;
}

/** What one badge scan did. */
export interface ScanResult {
  participant: Participant;
  session: Pick<
    Session,
    "id" | "title" | "breakAllowanceMinutes" | "audience" | "mandatory"
  >;
  action: ScanAction;
  presence: Presence;
  /** State after the scan: true = in the room, false = out. */
  inside: boolean;
  /** Set when a check-in ended a break. */
  breakTaken: BreakEvaluation | null;
  /** Written when that break was over the allowance, or for arriving late. */
  penalty: Penalty | null;
  /** Set on check-out: minutes spent inside. */
  insideMinutes: number | null;
  /** Set on a first check-in past the grace period. */
  lateMinutes: number | null;
  /** Excused here by a technical challenge at the same time. */
  excused: boolean;
  /** Null when the scan was saved but the figures could not be read. */
  stats: SessionStats | null;
}

export type SessionWithStats = Session & { stats: SessionStats };

/**
 * A participant plus the moment their current state began: check-in time for
 * someone inside, check-out time for someone on a break.
 */
export type RosterParticipant = Participant & { since: string };

export interface AttendanceReport {
  session: Session;
  stats: SessionStats;
  inside: RosterParticipant[];
  onBreak: RosterParticipant[];
  missing: Participant[];
}

export interface BranchStanding {
  sb: string;
  points: number;
  penalties: number;
}

/**
 * Penalties point at participants and sessions with no foreign key (the
 * website owns `participants` and may delete them). Prisma then returns null
 * for the relation even though its generated type says it can't be — so the
 * nulls are spelled out here. The penalty itself, with its snapshotted `sb`,
 * stays valid and still counts.
 */
export type PenaltyRow = Penalty & {
  session: { title: string } | null;
  participant: {
    id: string;
    sb: string | null;
    user: { name: string; lastName: string } | null;
  } | null;
};

export interface Leaderboard {
  standings: BranchStanding[];
  totalPoints: number;
  penalties: PenaltyRow[];
}

/** GET /api/sessions/[id]/changes — what other stations scanned lately. */
export interface SessionChanges {
  /** Server time of this answer; send it back as `since` next time. */
  now: string;
  /** Latest state of every participant whose state changed since then. */
  changes: { participant: Participant; inside: boolean; since: string }[];
  stats: SessionStats;
  /** When the session really started, as tapped at a door; null = not yet. */
  startedAt: string | null;
}

/** The signed-in account, as /api/auth/me returns it. */
export interface ScannerProfile {
  id: string;
  username: string;
  displayName: string;
  role: "Scanner" | "Manager";
}

export type { Presence, Session, Penalty, ScanAction, SessionStats, BreakEvaluation };
