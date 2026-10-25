import { TRAINING_KINDS } from "./db/schema";

/**
 * Pure helpers for the player training log (the public /log/<token> page and the coach's Training
 * tab). Dates are plain "YYYY-MM-DD" strings, same as games.date.
 */

export const MAX_MINUTES_PER_ENTRY = 300;
export const MAX_ENTRIES_PER_PLAYER_PER_DAY = 12;
/** How far back a player can log or change an entry. */
export const LOG_WINDOW_DAYS = 30;
/** The time zone "today" and "this week" mean on the coach's summary. */
export const SUMMARY_TIME_ZONE = "America/New_York";

export function isTrainingKind(value: string): value is (typeof TRAINING_KINDS)[number] {
  return (TRAINING_KINDS as readonly string[]).includes(value);
}

/** "Jordan Reyes" -> "Jordan R." so the public page doesn't show full names. */
export function publicName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${parts[0]} ${lastInitial}.`;
}

/** A US mobile number as +1XXXXXXXXXX, or null when it isn't a plausible 10-digit number. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10 || ten[0] === "0" || ten[0] === "1") return null;
  return `+1${ten}`;
}

/** "+15551234567" -> "(555) 123-4567" */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

export function lastFour(e164: string): string {
  return e164.replace(/\D/g, "").slice(-4);
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

export function addDays(value: string, days: number): string {
  const d = parseDate(value);
  if (!d) throw new Error(`Bad date: ${value}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether a player may log work on this date: a real calendar date, no more than a day ahead of
 * the server's today (so a phone in a time zone ahead of the server still works) and no more than
 * LOG_WINDOW_DAYS back.
 */
export function isLoggableDate(value: string, serverToday: string): boolean {
  if (!parseDate(value)) return false;
  return value <= addDays(serverToday, 1) && value >= addDays(serverToday, -LOG_WINDOW_DAYS);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(value: string): string {
  const d = parseDate(value);
  return d ? WEEKDAYS[d.getUTCDay()] : "";
}

/** The Monday of the week containing `value`. */
export function weekStart(value: string): string {
  const d = parseDate(value);
  if (!d) throw new Error(`Bad date: ${value}`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return addDays(value, -sinceMonday);
}

/** Today as YYYY-MM-DD in the given time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

export const SUMMARY_RANGES = [
  { key: "week", label: "This week" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "all", label: "All time" },
] as const;
export type SummaryRange = (typeof SUMMARY_RANGES)[number]["key"];

export function parseRange(value: string | undefined): SummaryRange {
  return SUMMARY_RANGES.some((r) => r.key === value) ? (value as SummaryRange) : "week";
}

/** First date (inclusive) of a summary range, or null for "all time". */
export function rangeStart(range: SummaryRange, today: string): string | null {
  if (range === "week") return weekStart(today);
  if (range === "7") return addDays(today, -6);
  if (range === "30") return addDays(today, -29);
  return null;
}

/** 95 -> "1h 35m", 45 -> "45m", 120 -> "2h", 0 -> "0m". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export type LogEntry = { playerId: string; logDate: string; minutes: number; kind: string; approved: boolean };

export type PlayerSummary = {
  playerId: string;
  /** Approved minutes only. */
  totalMinutes: number;
  /** Logged but not yet approved by a parent. */
  pendingMinutes: number;
  /** Approved sessions. */
  sessions: number;
  /** Approved minutes by type of work. */
  byKind: Record<string, number>;
  /** Most recent day with approved time. */
  lastLogged: string | null;
};

/** Totals per player over the entries given (the caller has already applied the date range).
 *  Only parent-approved time counts toward the totals; the rest is reported as pending. */
export function summarizeByPlayer(playerIds: string[], entries: LogEntry[]): Map<string, PlayerSummary> {
  const out = new Map<string, PlayerSummary>();
  for (const id of playerIds) {
    out.set(id, { playerId: id, totalMinutes: 0, pendingMinutes: 0, sessions: 0, byKind: {}, lastLogged: null });
  }
  for (const e of entries) {
    const s = out.get(e.playerId);
    if (!s) continue;
    if (!e.approved) {
      s.pendingMinutes += e.minutes;
      continue;
    }
    s.totalMinutes += e.minutes;
    s.sessions += 1;
    s.byKind[e.kind] = (s.byKind[e.kind] ?? 0) + e.minutes;
    if (!s.lastLogged || e.logDate > s.lastLogged) s.lastLogged = e.logDate;
  }
  return out;
}
