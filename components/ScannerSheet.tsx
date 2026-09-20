"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useFetch } from "@/hooks/useFetch";
import { useAttendance } from "@/hooks/useAttendance";
import AttendanceRoster from "@/components/AttendanceRoster";
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

/** Ignore the same code re-detected within this window (camera keeps seeing it). */
const SAME_CODE_COOLDOWN_MS = 3000;
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
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
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

    const last = lastScanRef.current;
    if (
      last &&
      last.code === code &&
      Date.now() - last.at < SAME_CODE_COOLDOWN_MS
    ) {
      return;
    }
    lastScanRef.current = { code, at: Date.now() };

    const scan = await fetch("/api/scan", {
      method: "POST",
      body: JSON.stringify({ qrCode: code, sessionId: session.id }),
    });

    if (!scan) return;

    setResult(scan);
    setStats(scan.stats);

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
      className="scan-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`Scanning for ${session.title}`}
    >
      <header className="scan-sheet-head">
        <span className="scan-sheet-title">{session.title}</span>
        <div className="flex items-center gap-4">
          <span className="scan-sheet-count">
            {stats.inside}
            <span> / {stats.total} in</span>
          </span>
          <button
            type="button"
            className="scan-sheet-close"
            onClick={onClose}
            aria-label="Stop scanning"
          >
            ×
          </button>
        </div>
      </header>

      <div className="scan-sheet-body">
        <CameraScanner onDecode={handleDecode} paused={loading} />

        {loading && (
          <p
            className="text-xs text-center"
            style={{ color: "var(--color-green)" }}
          >
            Looking up participant…
          </p>
        )}

        {error && <div className="scan-error">{error}</div>}

        {result && <ScanBanner result={result} />}

        <AttendanceRoster
          inside={roster.inside}
          onBreak={roster.onBreak}
          missing={roster.missing}
          breakAllowanceMinutes={session.breakAllowanceMinutes}
          penaltyPoints={session.penaltyPoints}
          loading={report === null}
          onRefresh={() => {
            setMoves(new Map());
            reloadAttendance();
          }}
        />

        <p className="scan-hint text-center">
          Each scan flips the participant&apos;s state: in → out → in. Badges
          are not printed yet — the QR holds the participant id.
        </p>
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
        ? "Back from break"
        : "Checked in"
      : result.action === "CheckedOut"
        ? "Checked out — break started"
        : "Duplicate scan ignored";

  const allowance = result.session.breakAllowanceMinutes;

  return (
    <div className={`scan-result scan-result--${variant}`} role="status">
      <span className="scan-result-title">{title}</span>
      <span className="scan-result-name">{name || "—"}</span>
      <span className="scan-result-meta">
        {result.participant.sb ?? "no SB"} ·{" "}
        {result.participant.participantType}
      </span>

      {result.breakTaken && (
        <span
          className={`scan-result-break ${
            result.breakTaken.overAllowance ? "scan-result-break--over" : ""
          }`}
        >
          Break lasted <strong>{result.breakTaken.breakMinutes} min</strong>
          {result.breakTaken.overAllowance
            ? ` — ${result.breakTaken.minutesOver} min over the ${allowance} min allowance`
            : ` — within the ${allowance} min allowance`}
        </span>
      )}

      {result.penalty && (
        <span className="scan-result-penalty">
          −{result.penalty.points} points
          {result.participant.sb ? ` · ${result.participant.sb}` : ""}
        </span>
      )}

      {result.action === "CheckedOut" && result.insideMinutes !== null && (
        <span className="scan-result-break">
          Was inside for <strong>{result.insideMinutes} min</strong>. The break
          timer starts now.
        </span>
      )}
    </div>
  );
}

function CameraPlaceholder() {
  return (
    <div className="scan-viewport">
      <div className="scan-viewport-placeholder">Starting camera…</div>
    </div>
  );
}
