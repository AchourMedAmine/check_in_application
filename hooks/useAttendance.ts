"use client";

import { useCallback, useEffect, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { AttendanceReport, SessionWithStats } from "@/lib/types";

/** Every session with its live figures, earliest first. */
export function useSessions() {
  const { fetch } = useFetch<SessionWithStats[]>();
  const [sessions, setSessions] = useState<SessionWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const data = await fetch("/api/sessions");
      if (cancelled) return;
      setSessions(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetch, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { sessions, loading, reload };
}

/** Full roster for a session, split by state. */
export function useAttendance(sessionId: string | undefined) {
  const { fetch } = useFetch<AttendanceReport>();
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    (async () => {
      const data = await fetch(`/api/sessions/${sessionId}/attendance`);
      if (!cancelled) setReport(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetch, sessionId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { report, reload };
}
