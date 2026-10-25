import { DEFAULT_STAT_CATEGORIES } from "@/lib/db/schema";

// Parses a pasted game box score such as
//   #9 Lilly Brosseau: 2 G, 0 A, 3 SH, 1 GB, 1 DC, 0 CT, 0 TO
// into stat values per player. Pure, so the same code previews on the page and is unit-tested.

/** Abbreviation -> the stat category key it fills. */
export const STAT_CODES: Record<string, string> = {
  G: "goals",
  A: "assists",
  SH: "shots",
  GB: "gb",
  DC: "draw_controls",
  CT: "caused_turnovers",
  TO: "turnovers",
  SV: "saves",
  GA: "goals_allowed",
  FTO: "fto",
};

const LABELS = new Map<string, string>(DEFAULT_STAT_CATEGORIES.map((c) => [c.key, c.label]));
export function statLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

export type ParsedLine = {
  line: number;
  number: string | null;
  name: string;
  stats: Record<string, number>; // category key -> value
  unknownCodes: string[];
};

/** One play-by-play event, e.g. "1st half · 19:36 remaining · 0:24 elapsed — Draw control — Lylah Klinger". */
export type ParsedEvent = {
  seq: number; // order in the pasted text
  period: number; // 1, 2 (3+ for overtime)
  periodLabel: string; // "1st half"
  remainingSec: number | null;
  elapsedSec: number | null;
  paused: boolean; // logged while the clock was stopped
  kind: string; // see EVENT_KINDS, or "other"
  label: string; // the event as written, e.g. "Draw control"
  name: string; // the player as written
};

export type ParseResult = {
  rows: ParsedLine[];
  unparsed: { line: number; text: string }[];
  events: ParsedEvent[];
  /** The final score from a header line like "... · 6–4 (Final)", when there is one. */
  score: [number, number] | null;
};

/** Play-by-play wording -> stored event kind. */
export const EVENT_KINDS: Record<string, string> = {
  "draw control": "draw_control",
  turnover: "turnover",
  "goalie save": "goalie_save",
  goal: "goal",
  assist: "assist",
  "shot saved": "shot_saved",
  "caused turnover": "caused_turnover",
  "ground ball": "ground_ball",
  "goal allowed": "goal_allowed",
  "shot wide / post": "shot_wide",
};

const EVENT_LINE =
  /^(.+?)\s*[·•]\s*(\d+):(\d{2})\s*remaining\s*[·•]\s*(\d+):(\d{2})\s*elapsed(\s*\(paused\))?\s*[—–-]+\s*(.+?)\s+[—–-]+\s+(.+)$/i;

function parseEvent(line: string, seq: number): ParsedEvent | null {
  const m = EVENT_LINE.exec(line);
  if (!m) return null;
  const periodLabel = m[1].trim();
  const digit = /(\d)/.exec(periodLabel);
  const label = m[7].trim();
  return {
    seq,
    period: digit ? Number.parseInt(digit[1], 10) : /ot|overtime/i.test(periodLabel) ? 3 : 1,
    periodLabel,
    remainingSec: Number(m[2]) * 60 + Number(m[3]),
    elapsedSec: Number(m[4]) * 60 + Number(m[5]),
    paused: !!m[6],
    kind: EVENT_KINDS[label.toLowerCase()] ?? "other",
    label,
    name: m[8].trim(),
  };
}

const LINE = /^#?\s*(\d{1,3})?\s*[-.]?\s*([^:]+?)\s*:\s*(.*)$/;

export function parseStatText(text: string): ParseResult {
  const rows: ParsedLine[] = [];
  const unparsed: { line: number; text: string }[] = [];
  const events: ParsedEvent[] = [];
  let score: [number, number] | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    // Play-by-play lines (checked first - their clock times contain colons).
    const ev = parseEvent(line, events.length + 1);
    if (ev) return void events.push(ev);
    if (/^play-by-play/i.test(line)) return;

    const m = LINE.exec(line);
    // Text that isn't a player line is only worth a warning in the middle of the player lines.
    // Before the first one it's the header; once the play-by-play has begun it's the footer.
    const ignorable = rows.length === 0 || events.length > 0;
    if (!m || !m[2].trim()) {
      if (rows.length === 0) {
        const sc = /(\d+)\s*[–-]\s*(\d+)\s*\(final\)/i.exec(line);
        if (sc) score = [Number(sc[1]), Number(sc[2])];
      }
      if (!ignorable) unparsed.push({ line: i + 1, text: line });
      return;
    }
    const stats: Record<string, number> = {};
    const unknownCodes: string[] = [];
    let any = false;
    for (const part of m[3].split(/[,;]/)) {
      const item = part.trim();
      if (!item) continue;
      const hit = /^(\d{1,3})\s*([A-Za-z]+)$/.exec(item) ?? /^([A-Za-z]+)\s*[:=]?\s*(\d{1,3})$/.exec(item);
      if (!hit) {
        unknownCodes.push(item);
        continue;
      }
      const [count, code] = /^\d/.test(hit[1]) ? [hit[1], hit[2]] : [hit[2], hit[1]];
      const key = STAT_CODES[code.toUpperCase()];
      if (!key) {
        unknownCodes.push(code.toUpperCase());
        continue;
      }
      stats[key] = (stats[key] ?? 0) + Number.parseInt(count, 10);
      any = true;
    }
    if (!any && unknownCodes.length === 0) {
      if (!ignorable) unparsed.push({ line: i + 1, text: line });
      return;
    }
    rows.push({ line: i + 1, number: m[1] ?? null, name: m[2].trim(), stats, unknownCodes });
  });
  return { rows, unparsed, events, score };
}

export type RosterPlayer = { id: string; name: string; number: string | null };
export type Match = { playerId: string; by: "name" | "number" } | null;

export function normName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function normNumber(value: string | null) {
  return (value ?? "").replace(/^#/, "").trim();
}

/** Finds the roster player for a parsed line: by full name first, otherwise by jersey number.
 *  Returns null when nothing matches or the match would be ambiguous. */
export function matchPlayer(row: Pick<ParsedLine, "name" | "number">, roster: RosterPlayer[]): Match {
  const name = normName(row.name);
  const byName = roster.filter((p) => normName(p.name) === name);
  if (byName.length === 1) return { playerId: byName[0].id, by: "name" };
  if (byName.length === 0 && row.number) {
    const num = normNumber(row.number);
    const byNumber = roster.filter((p) => normNumber(p.number) === num && num !== "");
    if (byNumber.length === 1) return { playerId: byNumber[0].id, by: "number" };
  }
  return null;
}

// ---- Using the play-by-play -------------------------------------------------------------

/** What each event adds to a player's box-score line. Goals also count as shots. */
const EVENT_STATS: Record<string, string[]> = {
  goal: ["goals", "shots"],
  assist: ["assists"],
  shot_saved: ["shots"],
  shot_wide: ["shots"],
  ground_ball: ["gb"],
  draw_control: ["draw_controls"],
  caused_turnover: ["caused_turnovers"],
  turnover: ["turnovers"],
  goalie_save: ["saves"],
  goal_allowed: ["goals_allowed"],
};

/** Stats the box score does not carry: they only exist in the play-by-play. */
const GOALIE_KEYS = ["saves", "goals_allowed"];

/** Per player (by normalized name), the stat totals the events add up to. */
export function eventTotals(events: ParsedEvent[]): Map<string, { name: string; stats: Record<string, number> }> {
  const out = new Map<string, { name: string; stats: Record<string, number> }>();
  for (const e of events) {
    const keys = EVENT_STATS[e.kind];
    if (!keys) continue;
    const id = normName(e.name);
    const entry = out.get(id) ?? { name: e.name, stats: {} };
    for (const k of keys) entry.stats[k] = (entry.stats[k] ?? 0) + 1;
    out.set(id, entry);
  }
  return out;
}

/** Adds the goalie stats (Saves, Goals Allowed) from the play-by-play to the box-score rows. A
 *  value the box score already gives wins. A goalie missing from the box score gets a row of her own. */
export function withGoalieStats(rows: ParsedLine[], events: ParsedEvent[]): ParsedLine[] {
  const totals = eventTotals(events);
  const out = rows.map((r) => ({ ...r, stats: { ...r.stats } }));
  let extra = 0;
  for (const [id, t] of totals) {
    const derived = GOALIE_KEYS.filter((k) => t.stats[k] !== undefined);
    if (derived.length === 0) continue;
    const row = out.find((r) => normName(r.name) === id);
    if (row) {
      for (const k of derived) if (row.stats[k] === undefined) row.stats[k] = t.stats[k];
    } else {
      out.push({ line: 100000 + extra++, number: null, name: t.name, stats: Object.fromEntries(derived.map((k) => [k, t.stats[k]])), unknownCodes: [] });
    }
  }
  return out;
}

/** Where the box score and the play-by-play disagree (plain-English warnings, empty when they agree). */
export function crossCheck(rows: ParsedLine[], events: ParsedEvent[], score: [number, number] | null): string[] {
  if (events.length === 0) return [];
  const warnings: string[] = [];
  const totals = eventTotals(events);
  const checked = ["goals", "assists", "shots", "gb", "draw_controls", "caused_turnovers", "turnovers"];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = normName(r.name);
    seen.add(id);
    const ev = totals.get(id)?.stats ?? {};
    for (const k of checked) {
      const box = r.stats[k];
      if (box === undefined) continue;
      const fromEvents = ev[k] ?? 0;
      if (box !== fromEvents) warnings.push(`${r.name}: ${statLabel(k)} is ${box} in the box score but ${fromEvents} in the play-by-play.`);
    }
  }
  for (const [id, t] of totals) {
    if (seen.has(id)) continue;
    const named = checked.filter((k) => (t.stats[k] ?? 0) > 0);
    if (named.length > 0) warnings.push(`${t.name} appears in the play-by-play but not in the box score.`);
  }
  if (score) {
    const goals = rows.reduce((sum, r) => sum + (r.stats.goals ?? 0), 0);
    const allowed = events.filter((e) => e.kind === "goal_allowed").length;
    const okFor = goals === score[0];
    const okAgainst = allowed === score[1];
    if (!okFor || !okAgainst) {
      warnings.push(`The final score line says ${score[0]}-${score[1]}, but the box score has ${goals} goals and the play-by-play shows ${allowed} allowed.`);
    }
  }
  return warnings;
}

/** Goals for and against in each period, from the events. */
export function summarizePeriods(events: { period: number; periodLabel: string; kind: string }[]) {
  const out = new Map<number, { period: number; label: string; goalsFor: number; goalsAgainst: number }>();
  for (const e of events) {
    const row = out.get(e.period) ?? { period: e.period, label: e.periodLabel, goalsFor: 0, goalsAgainst: 0 };
    if (e.kind === "goal") row.goalsFor++;
    if (e.kind === "goal_allowed") row.goalsAgainst++;
    out.set(e.period, row);
  }
  return [...out.values()].sort((a, b) => a.period - b.period);
}

/** 1175 -> "19:35" */
export function formatClock(seconds: number | null): string {
  if (seconds === null) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
