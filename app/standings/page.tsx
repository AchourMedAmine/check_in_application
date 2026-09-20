"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useFetch } from "@/hooks/useFetch";
import { Leaderboard } from "@/lib/types";

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

  const max = Math.max(1, ...(data?.standings ?? []).map((s) => s.points));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="admin-heading text-2xl font-bold">Branch standings</h1>
          <p className="text-sm text-[var(--viz-ink-muted)]">
            Points deducted for breaks longer than the session allowance.
          </p>
        </div>
        <Link href="/" className="admin-btn-secondary px-3 py-1.5 text-[11px]">
          Sessions
        </Link>
      </div>

      {loading ? (
        <div className="admin-card h-40 animate-pulse" />
      ) : !data ? (
        <div className="admin-card p-6 text-center space-y-2">
          <span className="admin-badge admin-badge--pink">
            Could not load standings
          </span>
          <p className="text-sm text-[var(--viz-ink-muted)]">
            {error ?? "The server did not respond."}
          </p>
        </div>
      ) : data.standings.length === 0 ? (
        <div className="admin-card p-6 text-center">
          <span className="admin-badge admin-badge--green">
            No penalties yet
          </span>
          <p className="mt-3 text-sm text-[var(--viz-ink-muted)]">
            Nobody has gone over their break allowance.
          </p>
        </div>
      ) : (
        <>
          <section className="admin-card p-6 space-y-4">
            <h2 className="viz-tile-label">
              {data.totalPoints} points deducted in total
            </h2>
            <div className="viz-bars">
              {data.standings.map((s) => (
                <div key={s.sb} className="viz-bar-row">
                  <span className="viz-bar-label">{s.sb}</span>
                  <span className="viz-bar-track">
                    <span
                      className="viz-bar-fill"
                      style={{
                        width: `${(s.points / max) * 100}%`,
                        background: "var(--viz-2)",
                      }}
                    />
                  </span>
                  <span className="viz-bar-value">−{s.points}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-card p-6 space-y-4">
            <h2 className="viz-tile-label">
              Deduction log ({data.penalties.length})
            </h2>
            <p className="text-xs text-[var(--viz-ink-faint)]">
              Every deduction, with the break that caused it — this is the
              answer when a branch disputes its score.
            </p>
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>SB</th>
                    <th>Session</th>
                    <th>Break</th>
                    <th>Reason</th>
                    <th>Points</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.penalties.map((p) => (
                    <tr key={p.id} className="admin-row">
                      <td className="cell-strong">
                        {`${p.participant.user.name} ${p.participant.user.lastName}`.trim() ||
                          "—"}
                      </td>
                      <td>{p.sb ?? "—"}</td>
                      <td>{p.session.title}</td>
                      <td className="tabular-nums">{p.breakMinutes} min</td>
                      <td>
                        <span
                          className={`admin-badge ${
                            p.reason === "LeftEarly"
                              ? "admin-badge--pink"
                              : "admin-badge--amber"
                          }`}
                        >
                          {p.reason === "LeftEarly" ? "Left early" : "Over break"}
                        </span>
                      </td>
                      <td
                        className="tabular-nums"
                        style={{ color: "var(--color-pink)" }}
                      >
                        −{p.points}
                      </td>
                      <td className="text-xs">
                        {format(new Date(p.createdAt), "PP p")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
