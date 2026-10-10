"use client";

import { format } from "date-fns";
import { SessionWithStats } from "@/lib/types";

interface SessionActions {
  /** Open session → start scanning. */
  onStart: (session: SessionWithStats) => void;
  /** Scheduled session → open it, then start scanning. */
  onOpen: (session: SessionWithStats) => void;
  /** Open session → end it and charge the breaks still running. */
  onEnd: (session: SessionWithStats) => void;
  /** Managers open and close sessions; scanners only scan. */
  canManage: boolean;
  busy?: boolean;
}

const hm = (iso: Date | string) => format(new Date(iso), "HH:mm");

/** Room and time, each on its own terms rather than joined into one string. */
function where(session: SessionWithStats) {
  const time = `${hm(session.startsAt)}–${hm(session.endsAt)}`;
  return session.location ? `${session.location}, ${time}` : time;
}

/**
 * The session being scanned right now: the one big panel on the page, with
 * the live count and the button staff reach for.
 */
export function LiveSession({
  session,
  onStart,
  onEnd,
  canManage,
  busy = false,
}: { session: SessionWithStats } & SessionActions) {
  const { inside, onBreak, missing, total } = session.stats;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <section className="live" aria-labelledby={`live-${session.id}`}>
      <div className="live-head">
        <div className="min-w-0">
          <span className="live-flag">
            <span className="dia dia--green" aria-hidden />
            Live now
          </span>
          <h2 id={`live-${session.id}`} className="live-title mt-2">
            {session.title}
          </h2>
          <p className="live-where">{where(session)}</p>
        </div>

        <div className="live-count">
          <span className="live-count-value">{inside}</span>
          {total > 0 && <span className="live-count-total"> / {total}</span>}
          <div className="live-count-label">in the room</div>
        </div>
      </div>

      {total > 0 ? (
        <div>
          <div
            className="share"
            role="img"
            aria-label={`${inside} inside, ${onBreak} on a break, ${missing} not scanned yet`}
          >
            <span
              style={{ width: `${pct(inside)}%`, background: "var(--green)" }}
            />
            <span
              style={{ width: `${pct(onBreak)}%`, background: "var(--amber)" }}
            />
          </div>
          <div className="legend">
            <span>
              <span className="dia dia--green" aria-hidden />
              <strong>{inside}</strong> inside
            </span>
            <span>
              <span className="dia dia--amber" aria-hidden />
              <strong>{onBreak}</strong> on a break
            </span>
            <span>
              <span className="dia dia--faint" aria-hidden />
              <strong>{missing}</strong> not scanned yet
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--ink-2)]">
          No roster yet, so everyone scanned counts as a walk-in.
        </p>
      )}

      <div className="live-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onStart(session)}
        >
          Start scanning
        </button>
        {canManage && (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => onEnd(session)}
            disabled={busy}
          >
            {busy ? "Closing…" : "Close session"}
          </button>
        )}
      </div>
    </section>
  );
}

/** One line of the programme. */
export function AgendaRow({
  session,
  onStart,
  onOpen,
  canManage,
  busy = false,
}: { session: SessionWithStats } & SessionActions) {
  const isOpen = session.status === "Open";
  const isClosed = session.status === "Closed";
  const { inside, onBreak, total } = session.stats;
  const came = inside + onBreak;

  return (
    <li className={`agenda-row ${isClosed ? "agenda-row--closed" : ""}`}>
      <div className="agenda-time">
        <div className="agenda-time-start">{hm(session.startsAt)}</div>
        <div className="agenda-time-end">{hm(session.endsAt)}</div>
      </div>

      <div className="min-w-0">
        <h3 className="agenda-title">{session.title}</h3>
        {(session.location || !session.mandatory) && (
          <div className="agenda-meta">
            {session.location && <span>{session.location}</span>}
            {!session.mandatory && (
              <span className="chip">Attendance only</span>
            )}
          </div>
        )}
      </div>

      {/* Scheduled is the normal state, so it gets no marker — only what is
          happening (live, closed) or what a manager can do. */}
      {(isOpen || isClosed || canManage) && (
        <div className="agenda-side">
          {isOpen ? (
            <>
              <span className="agenda-state agenda-state--live">
                <span className="dia dia--green" aria-hidden />
                Live
              </span>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                onClick={() => onStart(session)}
              >
                Scan
              </button>
            </>
          ) : isClosed ? (
            <>
              <span className="agenda-state">Closed</span>
              <span className="agenda-tally">
                {came}
                {total > 0 ? ` of ${total}` : ""} came
              </span>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => onOpen(session)}
              disabled={busy}
            >
              {busy ? "Opening…" : "Open session"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
