"use client";

import { useState } from "react";
import { Participant, RosterParticipant } from "@/lib/types";

interface AttendanceRosterProps {
  inside: RosterParticipant[];
  onBreak: RosterParticipant[];
  missing: Participant[];
  /** Minutes a break may last before it counts against the SB. */
  breakAllowanceMinutes: number;
  /** Points the SB loses once a break goes over. */
  penaltyPoints: number;
  /** False for attendance-only sessions: breaks are timed but never "over". */
  mandatory: boolean;
  onRefresh: () => void;
  /** True until the first report has arrived. */
  loading?: boolean;
}

type Tab = "inside" | "onBreak" | "missing";

/** Whole minutes between `iso` and now, floored at 0. */
function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

const fullName = (p: Participant) =>
  `${p.user.name} ${p.user.lastName}`.trim() || "Unnamed participant";

/**
 * The roster of the open session, split by the three states a participant can
 * be in. One list at a time; it opens on the breaks, which is what staff at
 * the door have to keep an eye on.
 */
export default function AttendanceRoster({
  inside,
  onBreak,
  missing,
  breakAllowanceMinutes,
  penaltyPoints,
  mandatory,
  onRefresh,
  loading = false,
}: AttendanceRosterProps) {
  const [tab, setTab] = useState<Tab>("onBreak");
  const [query, setQuery] = useState("");

  const tabs: { id: Tab; label: string; count: number; dia: string }[] = [
    { id: "inside", label: "Inside", count: inside.length, dia: "dia--green" },
    { id: "onBreak", label: "On a break", count: onBreak.length, dia: "dia--amber" },
    { id: "missing", label: "Not scanned", count: missing.length, dia: "dia--faint" },
  ];

  const items: Participant[] =
    tab === "inside" ? inside : tab === "onBreak" ? onBreak : missing;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? items.filter((p) =>
        `${fullName(p)} ${p.sb ?? ""}`.toLowerCase().includes(needle)
      )
    : items;

  const empty = {
    inside: "Nobody is inside yet.",
    onBreak: "Nobody is out on a break.",
    missing: "Everyone expected has been scanned.",
  }[tab];

  return (
    <section className="space-y-3" aria-labelledby="roster-title">
      <div className="roster-head">
        <h2 id="roster-title" className="roster-title">
          Roster
        </h2>
        <button type="button" onClick={onRefresh} className="link-btn">
          Refresh
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Roster by state">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="roster-panel"
            className="tab"
            onClick={() => {
              setTab(t.id);
              setQuery("");
            }}
          >
            <span className="tab-count">
              <span className={`dia ${t.dia}`} aria-hidden />
              {loading ? "–" : t.count}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      <div id="roster-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {items.length > 8 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or student branch"
            aria-label="Search the list"
            className="input mb-2"
          />
        )}

        {loading ? (
          <p className="empty">Loading the roster…</p>
        ) : shown.length === 0 ? (
          <p className="empty">{items.length === 0 ? empty : "Nobody matches that search."}</p>
        ) : (
          <ul className="roster-list">
            {shown.map((p) => (
              <li key={p.id} className="roster-row">
                <span className="roster-who">
                  <span className="roster-name">{fullName(p)}</span>
                  <span className="roster-sb">
                    {(p as RosterParticipant).team && (
                      <span className="roster-team">{(p as RosterParticipant).team}</span>
                    )}
                    {p.sb ?? "No student branch"}
                    {(p as RosterParticipant).registered === false && (
                      <span className="roster-flag">Not registered</span>
                    )}
                  </span>
                </span>
                <RowMeta
                  tab={tab}
                  participant={p}
                  allowance={breakAllowanceMinutes}
                  penaltyPoints={penaltyPoints}
                  mandatory={mandatory}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 45 → "45 min", 75 → "1 h 15", 120 → "2 h". */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

function RowMeta({
  tab,
  participant,
  allowance,
  penaltyPoints,
  mandatory,
}: {
  tab: Tab;
  participant: Participant;
  allowance: number;
  penaltyPoints: number;
  mandatory: boolean;
}) {
  if (tab === "missing") return null;

  const since = (participant as RosterParticipant).since;
  const minutes = minutesSince(since);

  if (tab === "inside") {
    return <span className="roster-meta">{minutes} min in</span>;
  }

  // Attendance-only sessions (the hackathon): the allowance is only a guide.
  // Show the time left — or how far over — and never any points.
  if (!mandatory) {
    const left = allowance - minutes;
    return (
      <span className={`roster-meta ${left < 0 ? "roster-meta--over" : ""}`}>
        <span className={`dia ${left < 0 ? "dia--pink" : "dia--amber"}`} aria-hidden />
        {left >= 0
          ? `${duration(minutes)} out, ${duration(left)} left`
          : `${duration(minutes)} out, ${duration(-left)} over`}
      </span>
    );
  }

  // The allowance is cumulative: this break plus every finished one. Only
  // what the server will actually charge — the same rule decides both.
  const used = ((participant as RosterParticipant).breakUsed ?? 0) + minutes;
  const left = allowance - used;
  const answers = (participant as RosterParticipant).answers !== false;
  const over = left < 0 && answers;
  return (
    <span className={`roster-meta ${over ? "roster-meta--over" : ""}`}>
      <span className={`dia ${over ? "dia--pink" : "dia--amber"}`} aria-hidden />
      {left >= 0
        ? `${duration(minutes)} out, ${duration(left)} left`
        : answers
          ? `${duration(minutes)} out, ${duration(-left)} over, −${penaltyPoints}`
          : `${duration(minutes)} out, not charged`}
    </span>
  );
}
