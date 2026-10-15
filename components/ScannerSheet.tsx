"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useFetch } from "@/hooks/useFetch";
import { useAttendance } from "@/hooks/useAttendance";
import { useMe } from "@/hooks/useMe";
import { format } from "date-fns";
import AttendanceRoster from "@/components/AttendanceRoster";
import { acceptRead, type SeenBadges } from "@/lib/scan-gate";
import { mergeMoves, type RosterMove } from "@/lib/roster-moves";
import {
  RosterParticipant,
  ScanResult,
  SessionChanges,
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

/**
 * Other stations' scans: a light "what changed?" request this often, so two
 * phones at one session agree within seconds rather than at the next full
 * refresh.
 */
const CHANGES_POLL_MS = 3_000;

export default function ScannerSheet({ session, onClose }: ScannerSheetProps) {
  const { fetch, loading, error } = useFetch<ScanResult>();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState(session.stats);
  // When the session really began (tapped at a door); lateness counts from it.
  const [startedAt, setStartedAt] = useState<string | null>(
    session.startedAt ? String(session.startedAt) : null
  );
  const me = useMe();
  const { report, reload: reloadAttendance } = useAttendance(session.id);
  // State changes since the roster was fetched — this phone's scans and the
  // other stations' — applied on top of it, so the whole roster need not be
  // re-downloaded after every single scan.
  const [moves, setMoves] = useState<Map<string, RosterMove>>(new Map());
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

  // Pick up the other stations' scans every few seconds. A timeout chain,
  // not an interval, so a slow answer never stacks up requests; paused while
  // the screen is off.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let since: string | null = null;

    const tick = async () => {
      if (document.visibilityState === "visible") {
        const query = since ? `?since=${encodeURIComponent(since)}` : "";
        const res = await global
          .fetch(`/api/sessions/${session.id}/changes${query}`)
          .catch(() => null);
        if (res?.ok && !stopped) {
          const { data } = (await res.json()) as { data: SessionChanges };
          since = data.now;
          setStats(data.stats);
          setStartedAt(data.startedAt);
          setMoves((prev) => mergeMoves(prev, data.changes));
        }
      }
      if (!stopped) timer = setTimeout(tick, CHANGES_POLL_MS);
    };

    timer = setTimeout(tick, CHANGES_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [session.id]);

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
    // Someone not on this session's list was turned away: make the phone
    // buzz too, so a door volunteer looking up from the screen still notices.
    if (scan.action === "Refused") {
      navigator.vibrate?.([200, 100, 200]);
    }

    if (scan.presence && (scan.action === "CheckedIn" || scan.action === "CheckedOut")) {
      const presence = scan.presence;
      setMoves((prev) =>
        mergeMoves(prev, [
          {
            participant: scan.participant,
            inside: scan.inside,
            since: String(
              scan.inside ? presence.checkInAt : presence.checkOutAt
            ),
            answers: scan.notCharged === null,
            registered: scan.registered !== false,
          },
        ])
      );
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
      const entry = {
        ...m.participant,
        since: m.since,
        answers: m.answers,
        registered: m.registered,
      };
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
          {session.mandatory && (
            <StartBar
              session={session}
              startedAt={startedAt}
              onChange={setStartedAt}
              canUndo={me?.role === "Manager"}
            />
          )}

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

  // Someone not on this session's list is the one scan the door has to stop
  // at: they are not let in, and nothing was recorded.
  const refused = result.action === "Refused";

  const variant = refused
    ? "alert"
    : result.action === "CheckedIn"
      ? "in"
      : result.action === "CheckedOut"
        ? "out"
        : "dup";

  const title = refused
    ? result.refusedReason === "unpaid"
      ? "Not paid — do not let them in"
      : result.refusedReason === "banned"
        ? "Banned — do not let them in"
        : "Not registered — do not let them in"
    : result.action === "CheckedIn"
      ? result.breakTaken
        ? "Back from a break"
        : result.lateMinutes !== null
          ? "Checked in late"
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

      {result.lateMinutes !== null && (
        <p className="result-detail">
          Arrived <strong>{result.lateMinutes} min</strong> after the start
          {result.penalty ? "." : ", but is not charged here."}
        </p>
      )}

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

      {refused && (
        <p className="result-detail">
          {result.refusedReason === "not-registered"
            ? "They are not on this session's list, so they"
            : result.refusedReason === "banned"
              ? "They are banned from the congress, so they"
              : "Their registration is not paid, so they"}{" "}
          were not checked in and are not counted.
        </p>
      )}

      {result.notCharged && result.action !== "Duplicate" && !refused && (
        <p className="result-detail">Not charged here: {result.notCharged}.</p>
      )}

      {result.action === "Duplicate" && (
        <p className="result-detail text-[var(--ink-2)]">
          Scanned less than 10 seconds ago, so nothing changed.
        </p>
      )}
    </div>
  );
}

/**
 * Lateness counts from the moment the session really began — when the
 * moderator or instructor started — which only the person at the door can
 * see. One tap records it; a manager can take it back.
 */
function StartBar({
  session,
  startedAt,
  onChange,
  canUndo,
}: {
  session: SessionWithStats;
  startedAt: string | null;
  onChange: (startedAt: string | null) => void;
  canUndo: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setProblem(null);
    const res = await global
      .fetch(`/api/sessions/${session.id}/start`, { method })
      .catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) {
      setProblem(body?.error ?? "That didn't go through. Try again.");
      return;
    }
    const s = method === "POST" ? body.data : body.data.session;
    onChange(s.startedAt ? String(s.startedAt) : null);
  };

  const start = () => {
    const sure = window.confirm(
      `Has "${session.title}" started?\n\nTap only once the moderator or instructor ` +
        `has begun. From now on, anyone scanned more than 10 minutes later is ` +
        `charged as late.`
    );
    if (sure) send("POST");
  };

  const undo = () => {
    const sure = window.confirm(
      `Undo the start of "${session.title}"?\n\nEvery late penalty charged in this ` +
        `session is removed, and nobody counts as late until it is marked as started again.`
    );
    if (sure) send("DELETE");
  };

  if (!startedAt) {
    return (
      <div className="start-bar">
        <span>
          <strong>Not started yet.</strong> Tap when the speaker begins; late
          arrivals count from then.
        </span>
        <button type="button" className="btn btn--quiet btn--small" onClick={start} disabled={busy}>
          {busy ? "Saving…" : "Session started"}
        </button>
        {problem && <span className="start-bar-problem">{problem}</span>}
      </div>
    );
  }

  const at = new Date(startedAt);
  const lateFrom = new Date(at.getTime() + 10 * 60_000);
  return (
    <div className="start-bar start-bar--started">
      <span>
        <span className="dia dia--green" aria-hidden />
        <strong>Started {format(at, "HH:mm")}.</strong> Scans after{" "}
        {format(lateFrom, "HH:mm")} count as late.
      </span>
      {canUndo && (
        <button type="button" className="link-btn" onClick={undo} disabled={busy}>
          {busy ? "Saving…" : "Undo start"}
        </button>
      )}
      {problem && <span className="start-bar-problem">{problem}</span>}
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
