/**
 * Pure helpers for practice plans - tags, clock times and totals - kept free of DB code so the
 * rules are covered by plain unit tests.
 */

export const SUGGESTED_TAGS = [
  "Ground balls",
  "Shooting",
  "Clears",
  "Defense",
  "Fast break",
  "Conditioning",
  "Scrimmage",
] as const;

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 30;

/** Trims, collapses spaces, drops empties and case-insensitive duplicates (first spelling wins),
 *  and caps the count and length. Accepts a list or a comma-separated string. */
export function normalizeTags(input: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : (input ?? "").split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

export function totalMinutes(items: { minutes: number }[]): number {
  return items.reduce((sum, i) => sum + (Number.isFinite(i.minutes) ? i.minutes : 0), 0);
}

/** "18:05" -> minutes since midnight, or null if it isn't a valid 24h HH:MM. */
export function parseStartTime(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** 1085 -> "6:05 PM" (wraps past midnight). */
export function formatClock(minutesSinceMidnight: number): string {
  const total = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** The clock time each drill starts, in order, from the plan's start time (all null when the
 *  plan has no valid start time). */
export function clockTimes(startTime: string | null | undefined, minutes: number[]): (string | null)[] {
  const start = parseStartTime(startTime);
  if (start === null) return minutes.map(() => null);
  let at = start;
  return minutes.map((m) => {
    const label = formatClock(at);
    at += Number.isFinite(m) ? m : 0;
    return label;
  });
}
