// Format a SQLite timestamp ("YYYY-MM-DD HH:MM:SS", stored UTC) as a friendly
// local date + time, e.g. "May 29, 2026, 2:30 PM". Empty input → "".
export function formatTimestamp(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
