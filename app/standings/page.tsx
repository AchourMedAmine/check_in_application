"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useFetch } from "@/hooks/useFetch";
import { useMe } from "@/hooks/useMe";
import { Leaderboard, PenaltyRow, SessionWithStats } from "@/lib/types";

/** What the participant did, in the congress rules' own words. */
function describe(reason: string, minutes: number): string {
  switch (reason) {
    case "Absent":
      return "Absent";
    case "Late":
      return `Arrived ${minutes} min late`;
    case "LeftEarly":
      return `Left early, ${minutes} min out in total`;
    default:
      return `${minutes} min of breaks in total`;
  }
}

const REASON_WORDS: Record<string, [string, string]> = {
  OverBreak: ["over the break allowance", "over the break allowance"],
  LeftEarly: ["left early", "left early"],
  Absent: ["absence", "absences"],
  Late: ["late arrival", "late arrivals"],
};

/** "32 over the break allowance, 17 left early, 27 absences" */
function summary(penalties: PenaltyRow[]): string {
  const counts = new Map<string, number>();
  for (const p of penalties)
    counts.set(p.reason, (counts.get(p.reason) ?? 0) + 1);
  return ["OverBreak", "LeftEarly", "Absent", "Late"]
    .filter((r) => counts.get(r))
    .map((r) => {
      const n = counts.get(r)!;
      return `${n} ${REASON_WORDS[r][n === 1 ? 0 : 1]}`;
    })
    .join(", ");
}

/** The log as a CSV file, to keep a copy outside the app. */
function downloadCsv(penalties: PenaltyRow[], name: string) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    [
      "Participant",
      "Email",
      "Student branch",
      "Session",
      "What happened",
      "Minutes",
      "Points",
      "When",
    ],
    ...penalties.map((p) => [
      p.participant?.user
        ? `${p.participant.user.name} ${p.participant.user.lastName}`.trim()
        : "Deleted participant",
      p.participant?.user?.email ?? "",
      p.sb ?? "",
      p.session?.title ?? "",
      describe(p.reason, p.breakMinutes),
      p.breakMinutes,
      p.points,
      format(new Date(p.createdAt), "yyyy-MM-dd HH:mm"),
    ]),
  ];
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
    {
      type: "text/csv;charset=utf-8",
    },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function StandingsPage() {
  const { fetch, error } = useFetch<Leaderboard>();
  const { fetch: fetchSessions } = useFetch<SessionWithStats[]>();
  // The log, and which session it is for: loading until they match, so the
  // page can never get stuck on a choice that didn't trigger a fetch.
  const [loaded, setLoaded] = useState<{
    for: string;
    data: Leaderboard | null;
  } | null>(null);
  const [sessions, setSessions] = useState<SessionWithStats[]>([]);
  // "" = every session together; otherwise one session's complete log.
  const [sessionId, setSessionId] = useState("");

  // Sessions that can charge penalties, in programme order.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchSessions("/api/sessions");
      if (!cancelled && list) {
        setSessions(
          list
            .filter((s) => s.mandatory)
            .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSessions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetch(
        `/api/leaderboard${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`,
      );
      if (cancelled) return;
      setLoaded({ for: sessionId, data: result });
    })();
    return () => {
      cancelled = true;
    };
  }, [fetch, sessionId]);

  const chosen = sessions.find((s) => s.id === sessionId);
  const loading = loaded?.for !== sessionId;
  const data = loading ? null : loaded!.data;

  const me = useMe();
  const max = Math.max(1, ...(data?.standings ?? []).map((s) => s.points));

  // The server refuses officers too; this just says so plainly.
  if (me && me.role !== "Manager") {
    return (
      <div className="space-y-3">
        <h1 className="page-title">Branch standings</h1>
        <p className="page-lede">Only managers can see the standings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Branch standings</h1>
        <p className="page-lede">
          Points each student branch has lost: 5 for every absence, late
          arrival, early exit or break longer than the allowance.
        </p>
      </div>

      <div className="field max-w-md">
        <label htmlFor="session-pick" className="field-label">
          Session
        </label>
        <select
          id="session-pick"
          className="input"
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
          }}
        >
          <option value="">All sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {format(new Date(s.startsAt), "EEE HH:mm")} — {s.title}
              {s.status === "Closed"
                ? " (closed)"
                : s.status === "Open"
                  ? " (live)"
                  : ""}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="skeleton h-48" aria-busy="true" />
      ) : !data ? (
        <div className="notice">
          The standings didn&apos;t load:{" "}
          {error ?? "the server did not respond."}
        </div>
      ) : data.penalties.length === 0 ? (
        <p className="empty">No branch has lost points yet.</p>
      ) : (
        <>
          {data.standings.length > 0 && (
            <section className="panel" aria-labelledby="ranking-title">
              <h2 id="ranking-title" className="panel-title">
                {data.totalPoints} points lost across {data.standings.length}{" "}
                {data.standings.length === 1 ? "branch" : "branches"}
              </h2>
              <p className="panel-lede">Most points lost first.</p>

              <ol className="ranks">
                {data.standings.map((s, i) => (
                  <li key={s.sb} className="rank">
                    <span className="rank-pos">{i + 1}</span>
                    <span className="rank-sb">{s.sb}</span>
                    <span className="rank-track" aria-hidden>
                      <span
                        className="rank-fill"
                        style={{ width: `${(s.points / max) * 100}%` }}
                      />
                    </span>
                    <span className="rank-points">−{s.points}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="panel" aria-labelledby="log-title">
            <h2 id="log-title" className="panel-title">
              Every deduction ({data.penalties.length})
            </h2>
            <p className="panel-lede">{summary(data.penalties)}.</p>
            <button
              type="button"
              className="btn btn--quiet btn--small mt-3"
              onClick={() =>
                downloadCsv(
                  data.penalties,
                  `penalties-${chosen ? chosen.title.replace(/[^\w]+/g, "-").toLowerCase() : "all-sessions"}`,
                )
              }
            >
              Download as CSV
            </button>

            <ul className="log">
              {data.penalties.map((p) => (
                <li key={p.id} className="log-row">
                  <div className="log-line">
                    <span className="log-name">
                      {p.participant?.user
                        ? `${p.participant.user.name} ${p.participant.user.lastName}`.trim() ||
                          "Unnamed participant"
                        : "Deleted participant"}
                    </span>
                    <span className="log-points">−{p.points}</span>
                  </div>
                  <div className="log-facts">
                    <span>{p.sb ?? "No student branch"}</span>
                    <span>{p.session?.title ?? "Deleted session"}</span>
                    <span className="num">
                      {describe(p.reason, p.breakMinutes)}
                    </span>
                    <span className="num">
                      {format(new Date(p.createdAt), "EEE HH:mm")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
