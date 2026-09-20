"use client";

import { useState } from "react";
import SessionCard from "@/components/SessionCard";
import ScannerSheet from "@/components/ScannerSheet";
import { useSessions } from "@/hooks/useAttendance";
import { useFetch } from "@/hooks/useFetch";
import { SessionWithStats } from "@/lib/types";

export default function Home() {
  const { sessions, loading, reload } = useSessions();
  const { fetch } = useFetch<SessionWithStats>();
  const [active, setActive] = useState<SessionWithStats | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  // Staff open their own session when it is about to start.
  const openAndScan = async (session: SessionWithStats) => {
    setOpening(session.id);
    const updated = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Open" }),
    });
    setOpening(null);
    if (updated) {
      setActive(updated);
      reload();
    }
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

      {loading ? (
        <div className="session-list">
          <div className="admin-card h-48 animate-pulse" />
          <div className="admin-card h-48 animate-pulse" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="admin-card p-6 text-center">
          <span className="admin-badge admin-badge--gray">No sessions</span>
          <p className="mt-3 text-sm text-[var(--viz-ink-muted)]">
            Add them with{" "}
            <code className="text-[var(--color-green)]">npm run db:sessions</code>.
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
                busy={opening === s.id}
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
