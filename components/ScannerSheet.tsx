"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useFetch } from "@/hooks/useFetch";
import { useAttendance } from "@/hooks/useAttendance";
import AttendanceRoster from "@/components/AttendanceRoster";
import { acceptRead, type SeenBadges } from "@/lib/scan-gate";
import {
  Participant,
  RosterParticipant,
  ScanResult,
  SessionWithStats,
} from "@/lib/types";

// Camera scanner touches navigator.mediaDevices — client only.
const CameraScanner = dynamic(() => import("@/components/CameraScanner"), {
  ssr: false,
  loading: () => <CameraPlaceholder />,
});

interface ScannerSheetProps {
  session: SessionWithStats;
  onClose: () => void;
}

const RESULT_VISIBLE_MS = 5000;

/**
 * Breaks go over on the clock, so the roster has to move without anyone
 * touching it. Each refresh also settles overdue breaks server-side.
 */
const ROSTER_POLL_MS = 30_000;

/** A state change made since the roster was fetched, applied on top of it. */
interface LocalMove {
  participant: Participant;
  inside: boolean;
  since: string;
}

export default function ScannerSheet({ session, onClose }: ScannerSheetProps) {
  const { fetch, loading, error } = useFetch<ScanResult>();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState(session.stats);
  const { report, reload: reloadAttendance } = useAttendance(session.id);
  // Scans since the roster was fetched. Applying them locally avoids
  // re-downloading the whole roster after every single scan.
  const [moves, setMoves] = useState<Map<string, LocalMove>>(new Map());
  // When the camera last saw each badge — see lib/scan-gate.ts.
  const seenRef = useRef<SeenBadges>(new Map());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Escape closes the scanner
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Never leave a pending timer behind
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Keep the break timers and penalties current while the sheet is open.
  useEffect(() => {
    const id = setInterval(() => {
      setMoves(new Map());
      reloadAttendance();
    }, ROSTER_POLL_MS);
    return () => clearInterval(id);
  }, [reloadAttendance]);

  const handleDecode = async (rawValue: string) => {
    const code = rawValue.trim();
    if (!code || loading) return;

    // A badge held in front of the camera is read over and over; it counts
    // once, until it has left the frame.
    if (!acceptRead(seenRef.current, code, Date.now())) return;

    const scan = await fetch("/api/scan", {
      method: "POST",
      body: JSON.stringify({ qrCode: code, sessionId: session.id }),
    });

    if (!scan) {
      // Nothing was recorded — let the very same badge try again at once.
      seenRef.current.delete(code);
      return;
    }
    // The camera is paused while the request runs, so it could not keep
    // seeing the badge. Count it as still in view now — a slow network must
    // not make a held badge look as if it had left the frame.
    seenRef.current.set(code, Date.now());

    setResult(scan);
    if (scan.stats) setStats(scan.stats);

    if (scan.action !== "Duplicate") {
      setMoves((prev) => {
        const next = new Map(prev);
        next.set(scan.participant.id, {
          participant: scan.participant,
          inside: scan.inside,
          since: String(
            scan.inside ? scan.presence.checkInAt : scan.presence.checkOutAt
          ),
        });
        return next;
      });
    }

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setResult(null), RESULT_VISIBLE_MS);
  };

  // Roster from the server, with this station's scans applied on top.
  const roster = useMemo(() => {
    const moved = (p: { id: string }) => moves.has(p.id);

    const inside: RosterParticipant[] = [];
    const onBreak: RosterParticipant[] = [];
    for (const m of moves.values()) {
      const entry = { ...m.participant, since: m.since };
      (m.inside ? inside : onBreak).push(entry);
    }

    return {
      inside: [...inside, ...(report?.inside ?? []).filter((p) => !moved(p))],
      onBreak: [...onBreak, ...(report?.onBreak ?? []).filter((p) => !moved(p))],
      missing: (report?.missing ?? []).filter((p) => !moved(p)),
    };
  }, [moves, report]);

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`Scanning for ${session.title}`}
    >
      <header className="sheet-head">
        <div className="sheet-head-inner">
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={onClose}
          >
            Done
          </button>

          <div className="sheet-title">
            <strong>{session.title}</strong>
            {session.location && <span>{session.location}</span>}
          </div>

          <div className="sheet-count" aria-live="polite">
            <span className="sheet-count-value">{stats.inside}</span>
            {stats.total > 0 && (
              <span className="sheet-count-total"> / {stats.total}</span>
            )}
            <div className="sheet-count-label">in the room</div>
          </div>
        </div>
      </header>

      <div className="sheet-body">
        <div className="sheet-body-inner">
          <CameraScanner onDecode={handleDecode} paused={loading} />

          <p className="scan-status" aria-live="polite">
            {loading ? "Looking up the badge…" : "Hold a badge inside the frame"}
          </p>

          {error && <div className="notice">{error}</div>}

          {result && <ScanBanner result={result} />}

          <AttendanceRoster
            inside={roster.inside}
            onBreak={roster.onBreak}
            missing={roster.missing}
            breakAllowanceMinutes={session.breakAllowanceMinutes}
            penaltyPoints={session.penaltyPoints}
            mandatory={session.mandatory}
            loading={report === null}
            onRefresh={() => {
              setMoves(new Map());
              reloadAttendance();
            }}
          />

          <p className="scan-hint">
            Each scan switches the person between inside and out. To scan
            the same badge again, take it out of the frame first.
          </p>
        </div>
      </div>
    </div>
  );
}

function ScanBanner({ result }: { result: ScanResult }) {
  const name =
    `${result.participant.user.name} ${result.participant.user.lastName}`.trim();

  const variant =
    result.action === "CheckedIn"
      ? "in"
      : result.action === "CheckedOut"
        ? "out"
        : "dup";

  const title =
    result.action === "CheckedIn"
      ? result.breakTaken
        ? "Back from a break"
        : "Checked in"
      : result.action === "CheckedOut"
        ? "Checked out"
        : "Already scanned";

  const allowance = result.session.breakAllowanceMinutes;
  const breakTaken = result.breakTaken;

  return (
    <div className={`result result--${variant}`} role="status">
      <span className="result-title">{title}</span>
      <span className="result-name">{name || "Unnamed participant"}</span>
      <span className="result-who">
        <span>{result.participant.sb ?? "No student branch"}</span>
        <span>{result.participant.participantType}</span>
      </span>

      {breakTaken && (
        <p className="result-detail">
          Out for <strong>{breakTaken.breakMinutes} min</strong>
          {!result.session.mandatory
            ? "." // attendance only: no allowance to measure against
            : breakTaken.overAllowance
              ? `, ${breakTaken.minutesOver} min over the ${allowance} min allowance.`
              : `, within the ${allowance} min allowance.`}
        </p>
      )}

      {result.penalty && (
        <span className="result-penalty">
          −{result.penalty.points} points
          {result.participant.sb && <span>{result.participant.sb}</span>}
        </span>
      )}

      {result.action === "CheckedOut" && result.insideMinutes !== null && (
        <p className="result-detail">
          Inside for <strong>{result.insideMinutes} min</strong>. The break
          timer is running.
        </p>
      )}

      {result.action === "Duplicate" && (
        <p className="result-detail text-[var(--ink-2)]">
          Scanned less than 10 seconds ago, so nothing changed.
        </p>
      )}
    </div>
  );
}

function CameraPlaceholder() {
  return (
    <div className="scan-viewport">
      <div className="scan-viewport-placeholder">Starting the camera…</div>
    </div>
  );
}
