"use client";

import { SessionWithStats } from "@/lib/types";
import { format, isSameDay } from "date-fns";

interface SessionCardProps {
  session: SessionWithStats;
  /** Tapped while Open — starts scanning. */
  onStart: (session: SessionWithStats) => void;
  /** Tapped while Scheduled — opens the session, then starts scanning. */
  onOpen: (session: SessionWithStats) => void;
  busy?: boolean;
}

export default function SessionCard({
  session,
  onStart,
  onOpen,
  busy = false,
}: SessionCardProps) {
  const { inside, onBreak, missing, total, unexpected } = session.stats;
  const isOpen = session.status === "Open";
  const isClosed = session.status === "Closed";
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const starts = new Date(session.startsAt);
  const ends = new Date(session.endsAt);
  const when = isSameDay(starts, ends)
    ? `${format(starts, "PP p")} – ${format(ends, "p")}`
    : `${format(starts, "PP p")} – ${format(ends, "PP p")}`;

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`admin-badge ${
                isOpen
                  ? "admin-badge--green"
                  : isClosed
                    ? "admin-badge--gray"
                    : "admin-badge--amber"
              }`}
            >
              {session.status}
            </span>
            <span
              className={`admin-badge ${
                session.audience === "Everyone"
                  ? "admin-badge--pink"
                  : "admin-badge--gray"
              }`}
            >
              {session.audience === "Everyone" ? "All participants" : "Assigned"}
            </span>
          </div>

          <h2 className="admin-heading text-xl font-bold">{session.title}</h2>

          <p className="text-sm text-[var(--viz-ink-muted)]">
            {session.location ? `${session.location} · ` : ""}
            {when}
          </p>
        </div>

        <div className="text-right">
          <div className="viz-tile-label">In the room</div>
          <div className="viz-meter-value">
            {inside}
            <span className="viz-meter-total"> / {total}</span>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-xs text-[var(--viz-ink-faint)]">
          No roster yet — participants pick their workshops on the TRSYP site.
        </p>
      ) : (
        <>
          <div
            className="viz-sharebar"
            role="img"
            aria-label={`${inside} inside, ${onBreak} on break, ${missing} not scanned yet`}
          >
            <span
              className="viz-sharebar-seg"
              style={{ width: `${pct(inside)}%`, background: "var(--viz-1)" }}
            />
            <span
              className="viz-sharebar-seg"
              style={{ width: `${pct(onBreak)}%`, background: "var(--viz-4)" }}
            />
            <span
              className="viz-sharebar-seg"
              style={{
                width: `${pct(missing)}%`,
                background: "var(--viz-track)",
              }}
            />
          </div>

          <div className="viz-footnote">
            <span className="viz-legend-item">
              <span className="viz-swatch" style={{ background: "var(--viz-1)" }} />
              {inside} inside
            </span>
            <span className="viz-legend-item">
              <span className="viz-swatch" style={{ background: "var(--viz-4)" }} />
              {onBreak} on break
            </span>
            <span className="viz-legend-item">
              <span
                className="viz-swatch"
                style={{ background: "var(--viz-track)" }}
              />
              {missing} not scanned
            </span>
            {unexpected > 0 && (
              <span className="viz-legend-item" style={{ color: "var(--color-pink)" }}>
                {unexpected} not on roster
              </span>
            )}
          </div>
        </>
      )}
    </>
  );

  // Open → the whole card starts scanning.
  if (isOpen) {
    return (
      <button
        type="button"
        className="admin-card session-card p-6 space-y-4"
        onClick={() => onStart(session)}
      >
        {body}
        <div className="session-card-cta">Tap to start scanning</div>
      </button>
    );
  }

  // Scheduled → opening it is a deliberate act, so it gets its own button.
  return (
    <div
      className={`admin-card p-6 space-y-4 ${isClosed ? "session-card--closed" : ""}`}
    >
      {body}
      {!isClosed && (
        <button
          type="button"
          className="admin-btn-primary session-open-btn"
          onClick={() => onOpen(session)}
          disabled={busy}
        >
          {busy ? "Opening…" : "Open & start scanning"}
        </button>
      )}
    </div>
  );
}
