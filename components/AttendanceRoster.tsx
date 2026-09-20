"use client";

import { useState } from "react";
import { Participant, RosterParticipant } from "@/lib/types";

interface AttendanceRosterProps {
  inside: RosterParticipant[];
  onBreak: RosterParticipant[];
  missing: Participant[];
  /** Minutes a break may last before it counts against the SB. */
  breakAllowanceMinutes: number;
  onRefresh: () => void;
  /** True until the first report has arrived. */
  loading?: boolean;
}

/** Whole minutes between `iso` and now, floored at 0. */
function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

/**
 * The roster of the open session, split by the three states a participant can
 * be in: inside the room, out on a break, or never scanned at all.
 */
export default function AttendanceRoster({
  inside,
  onBreak,
  missing,
  breakAllowanceMinutes,
  onRefresh,
  loading = false,
}: AttendanceRosterProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="viz-tile-label">Roster</h3>
        <button
          type="button"
          onClick={onRefresh}
          className="admin-btn-secondary px-3 py-1 text-[11px]"
        >
          Refresh
        </button>
      </div>

      <RosterGroup
        label="Inside"
        count={inside.length}
        accent="var(--color-green)"
        loading={loading}
        emptyText="Nobody is inside"
        items={inside}
        renderMeta={(p) => (
          <>
            <span className="scan-recent-time">
              {minutesSince(p.since)} min in
            </span>
            <span className="admin-badge admin-badge--green">Checked in</span>
          </>
        )}
      />

      <RosterGroup
        label="On break"
        count={onBreak.length}
        accent="#c9a227"
        loading={loading}
        emptyText="Nobody is out"
        items={onBreak}
        renderMeta={(p) => {
          const out = minutesSince(p.since);
          const over = out > breakAllowanceMinutes;
          return (
            <>
              <span
                className="scan-recent-time"
                style={over ? { color: "var(--color-pink)" } : undefined}
              >
                {out} min out
              </span>
              <span
                className={`admin-badge ${
                  over ? "admin-badge--pink" : "admin-badge--amber"
                }`}
              >
                {over ? "Over break" : "Checked out"}
              </span>
            </>
          );
        }}
      />

      <RosterGroup
        label="Not scanned yet"
        count={missing.length}
        accent="rgba(255,255,255,0.45)"
        loading={loading}
        emptyText="Everyone has been scanned"
        items={missing}
        renderMeta={(p) => (
          <span className="admin-badge admin-badge--gray">
            {p.sb ?? "no SB"}
          </span>
        )}
      />
    </section>
  );
}

interface RosterGroupProps<T extends Participant> {
  label: string;
  count: number;
  accent: string;
  loading: boolean;
  emptyText: string;
  items: T[];
  renderMeta: (item: T) => React.ReactNode;
}

function RosterGroup<T extends Participant>({
  label,
  count,
  accent,
  loading,
  emptyText,
  items,
  renderMeta,
}: RosterGroupProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? items.filter((p) =>
        `${p.user.name} ${p.user.lastName} ${p.sb ?? ""}`
          .toLowerCase()
          .includes(needle)
      )
    : items;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="viz-tile-label flex items-center gap-2 w-full"
        aria-expanded={open}
      >
        <span style={{ color: accent }}>{open ? "▾" : "▸"}</span>
        {label}
        <span style={{ color: accent }}>{loading ? "…" : count}</span>
      </button>

      {open && (
        <>
          {items.length > 8 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or SB…"
              className="admin-input w-full px-3 py-2 text-sm"
            />
          )}

          {filtered.length === 0 ? (
            <p className="admin-empty">
              {items.length === 0 ? emptyText : "No match"}
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto scan-recent">
              {filtered.map((p) => (
                <li key={p.id} className="scan-recent-row">
                  <span className="scan-recent-name">
                    {`${p.user.name} ${p.user.lastName}`.trim() || "—"}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    {renderMeta(p)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
