"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useFetch } from "@/hooks/useFetch";
import { useMe } from "@/hooks/useMe";
import { Leaderboard } from "@/lib/types";

/** What the participant did, in the congress rules' own words. */
function describe(reason: string, minutes: number): string {
  switch (reason) {
    case "Absent":
      return "Absent";
    case "Late":
      return `Arrived ${minutes} min late`;
    case "LeftEarly":
      return `Left early, out ${minutes} min`;
    default:
      return `${minutes} min break`;
  }
}

export default function StandingsPage() {
  const { fetch, error } = useFetch<Leaderboard>();
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetch("/api/leaderboard");
      if (cancelled) return;
      setData(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetch]);

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
            <p className="panel-lede">
              The break behind each lost point, for when a branch disputes its
              score.
            </p>

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
