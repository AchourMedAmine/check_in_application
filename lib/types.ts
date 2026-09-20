import type {
  Participant as ParticipantRow,
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
  session: Pick<Session, "id" | "title" | "breakAllowanceMinutes" | "audience">;
  action: ScanAction;
  presence: Presence;
  /** State after the scan: true = in the room, false = out. */
  inside: boolean;
  /** Set when a check-in ended a break. */
  breakTaken: BreakEvaluation | null;
  /** Set on check-out: minutes spent inside. */
  insideMinutes: number | null;
  stats: SessionStats;
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

export type { Presence, Session, ScanAction, SessionStats, BreakEvaluation };
