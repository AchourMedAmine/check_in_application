"use client";

import { useState } from "react";
import SessionCard from "@/components/SessionCard";
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
      `Close "${session.title}"?\n\nScanning stops, and everyone still out on a break ` +
        `is charged as having left early. This cannot be undone.`
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
  const upcoming = sessions.filter((s) => s.status === "Scheduled");
  const done = sessions.filter((s) => s.status === "Closed");

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="admin-heading text-2xl font-bold">Sessions</h1>
        <p className="text-sm text-[var(--viz-ink-muted)]">
          Tap your session to start scanning participants in and out.
        </p>
      </div>

      {actionError && <div className="scan-error">{actionError}</div>}

      {loading ? (
        <div className="session-list">
          <div className="admin-card h-48 animate-pulse" />
          <div className="admin-card h-48 animate-pulse" />
        </div>
      ) : failed ? (
        <div className="admin-card p-6 text-center space-y-3">
          <span className="admin-badge admin-badge--pink">
            Could not load sessions
          </span>
          <p className="text-sm text-[var(--viz-ink-muted)]">
            {error ?? "The server did not respond."}
          </p>
          <button
            type="button"
            onClick={reload}
            className="admin-btn-secondary px-4 py-2 text-[11px]"
          >
            Try again
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="admin-card p-6 text-center">
          <span className="admin-badge admin-badge--gray">No sessions</span>
          <p className="mt-3 text-sm text-[var(--viz-ink-muted)]">
            The database has no sessions yet.
          </p>
        </div>
      ) : (
        <>
          <SessionGroup label="Live now" sessions={live}>
            {(s) => (
              <SessionCard
                key={s.id}
                session={s}
                onStart={setActive}
                onOpen={openAndScan}
                onEnd={endSession}
                canManage={canManage}
                busy={busyId === s.id}
              />
            )}
          </SessionGroup>

          <SessionGroup label="Upcoming" sessions={upcoming}>
            {(s) => (
              <SessionCard
                key={s.id}
                session={s}
                onStart={setActive}
                onOpen={openAndScan}
                onEnd={endSession}
                canManage={canManage}
                busy={busyId === s.id}
              />
            )}
          </SessionGroup>

          <SessionGroup label="Finished" sessions={done}>
            {(s) => (
              <SessionCard
                key={s.id}
                session={s}
                onStart={setActive}
                onOpen={openAndScan}
                onEnd={endSession}
                canManage={canManage}
              />
            )}
          </SessionGroup>
        </>
      )}

      {active && (
        <ScannerSheet
          session={active}
          onClose={() => {
            setActive(null);
            // Pick up everything scanned while the sheet was open.
            reload();
          }}
        />
      )}
    </div>
  );
}

function SessionGroup({
  label,
  sessions,
  children,
}: {
  label: string;
  sessions: SessionWithStats[];
  children: (session: SessionWithStats) => React.ReactNode;
}) {
  if (sessions.length === 0) return null;

  return (
    <section>
      <h2 className="session-group-label">{label}</h2>
      <div className="session-list">{sessions.map(children)}</div>
    </section>
  );
}
