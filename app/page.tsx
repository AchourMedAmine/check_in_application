"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { AgendaRow, LiveSession, NextSession } from "@/components/SessionCard";
import ScannerSheet from "@/components/ScannerSheet";
import { useSessions } from "@/hooks/useAttendance";
import { useFetch } from "@/hooks/useFetch";
import { useMe } from "@/hooks/useMe";
import { SessionWithStats } from "@/lib/types";

export default function Home() {
  const { sessions, failed, loading, error, reload } = useSessions();
  const { fetch, error: actionError } = useFetch<SessionWithStats>();
  const me = useMe();
  const canManage = me?.role === "Manager";
  const [active, setActive] = useState<SessionWithStats | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // A manager opens a session when it is about to start.
  const openAndScan = async (session: SessionWithStats) => {
    setBusyId(session.id);
    const updated = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Open" }),
    });
    setBusyId(null);
    if (updated) {
      setActive(updated);
      reload();
    }
  };

  // Closing settles every break still running as LeftEarly — confirm first.
  const endSession = async (session: SessionWithStats) => {
    const sure = window.confirm(
      `Close "${session.title}"?\n\nScanning stops. Everyone expected who never came is ` +
        `charged as absent, and anyone still out longer than the allowance as having ` +
        `left early. This cannot be undone.`,
    );
    if (!sure) return;

    setBusyId(session.id);
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Closed" }),
    });
    setBusyId(null);
    reload();
  };

  const live = sessions.filter((s) => s.status === "Open");
  const isOfficer = me !== null && !canManage;

  // Doors open by themselves 30 minutes ahead; keep looking so this page
  // notices without anyone refreshing it.
  useEffect(() => {
    if (active) return;
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [active, reload]);

  // An officer never picks a session: the moment the one they cover goes
  // live, the scanner opens. Closing it with Done is respected — it won't
  // jump back open; the Start scanning button stays on the page.
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    if (!isOfficer || active || live.length !== 1) return;
    if (!dismissed.current.has(live[0].id)) setActive(live[0]);
  }, [isOfficer, active, live]);

  // What's next for an officer when nothing of theirs is live.
  const next = sessions
    .filter((s) => s.status === "Scheduled" && new Date(s.endsAt) > new Date())
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];

  // The programme, one list per day, in the order it happens.
  const days = useMemo(() => {
    const byDay = new Map<string, SessionWithStats[]>();
    for (const s of [...sessions].sort(
      (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
    )) {
      const key = format(new Date(s.startsAt), "yyyy-MM-dd");
      byDay.set(key, [...(byDay.get(key) ?? []), s]);
    }
    return [...byDay.entries()];
  }, [sessions]);

  const actions = {
    onStart: setActive,
    onOpen: openAndScan,
    onEnd: endSession,
    canManage,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">
          {isOfficer ? "Your sessions" : "Sessions"}
        </h1>
        <p className="page-lede">
          {canManage
            ? "Doors open by themselves 30 minutes before each session. Close each one when it ends."
            : "The scanner opens by itself when your session's doors open, 30 minutes before it starts."}
        </p>
      </div>

      {actionError && <div className="notice">{actionError}</div>}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="skeleton h-56" />
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
      ) : failed ? (
        <div className="notice space-y-3">
          <p>
            The sessions didn&apos;t load:{" "}
            {error ?? "the server did not respond."}
          </p>
          <button
            type="button"
            onClick={reload}
            className="btn btn--quiet btn--small"
          >
            Try again
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="empty">
          {isOfficer
            ? "You aren't assigned to a session yet. Ask a manager to assign you."
            : "No sessions yet. They appear here once the programme is loaded."}
        </p>
      ) : (
        <>
          {isOfficer &&
            live.length === 0 &&
            (next ? (
              <NextSession session={next} />
            ) : (
              <p className="empty">You have no more sessions. Thank you!</p>
            ))}

          {live.map((s) => (
            <LiveSession
              key={s.id}
              session={s}
              {...actions}
              busy={busyId === s.id}
            />
          ))}

          <div>
            {days.map(([day, list]) => (
              <section key={day} className="agenda-day" aria-label={day}>
                <h2 className="day-title">
                  {format(new Date(list[0].startsAt), "EEEE d MMMM")}
                </h2>
                <ul>
                  {list.map((s) => (
                    <AgendaRow
                      key={s.id}
                      session={s}
                      {...actions}
                      busy={busyId === s.id}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {active && (
        <ScannerSheet
          session={active}
          onClose={() => {
            dismissed.current.add(active.id);
            setActive(null);
            // Pick up everything scanned while the sheet was open.
            reload();
          }}
        />
      )}
    </div>
  );
}
