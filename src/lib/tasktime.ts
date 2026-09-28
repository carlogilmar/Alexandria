// Time + tag-color helpers for the task workflow (Sprint 69).
import type { Tag, Todo } from "$lib/ipc";

// SQLite `datetime('now')` returns "YYYY-MM-DD HH:MM:SS" in UTC (no zone).
// Parse it as UTC so ages/durations aren't off by the local offset.
export function parseSqlUtc(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return isNaN(d.getTime()) ? null : d;
}

// Compact "age" of a timestamp until `now` (ms epoch): 45s / 12m / 3h / 5d / 2w.
export function fmtAge(ts: string | null | undefined, now = Date.now()): string {
  const d = parseSqlUtc(ts);
  if (!d) return "";
  return coarse(Math.max(0, (now - d.getTime()) / 1000));
}

// Coarse duration between two timestamps ("lived 3d"): created → completed.
export function fmtSpan(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  const a = parseSqlUtc(from);
  const b = parseSqlUtc(to);
  if (!a || !b) return "";
  return coarse(Math.max(0, (b.getTime() - a.getTime()) / 1000));
}

// Total tracked work time in seconds for a task, including the live in-progress
// session when it's WIP (so the badge ticks). `now` is ms epoch.
export function liveWorkSeconds(todo: Todo, now = Date.now()): number {
  let s = todo.workSeconds;
  if (todo.status === "wip") {
    const started = parseSqlUtc(todo.wipStartedAt);
    if (started) s += Math.max(0, (now - started.getTime()) / 1000);
  }
  return s;
}

// Work time rendered "2h 15m" / "45m" / "30s". Empty string for zero.
export function fmtWork(seconds: number): string {
  const s = Math.floor(seconds);
  if (s <= 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function coarse(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// Fallback palette for tags created before the `color` column existed — keyed
// deterministically by id so a given tag always looks the same.
const FALLBACK = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#f43f5e", "#84cc16",
];

export function tagColor(tag: Pick<Tag, "id" | "color">): string {
  return tag.color ?? FALLBACK[tag.id % FALLBACK.length];
}
