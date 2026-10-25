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

export type ParseResult = { rows: ParsedLine[]; unparsed: { line: number; text: string }[] };

const LINE = /^#?\s*(\d{1,3})?\s*[-.]?\s*([^:]+?)\s*:\s*(.*)$/;

export function parseStatText(text: string): ParseResult {
  const rows: ParsedLine[] = [];
  const unparsed: { line: number; text: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = LINE.exec(line);
    if (!m || !m[2].trim()) return void unparsed.push({ line: i + 1, text: line });
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
    if (!any && unknownCodes.length === 0) return void unparsed.push({ line: i + 1, text: line });
    rows.push({ line: i + 1, number: m[1] ?? null, name: m[2].trim(), stats, unknownCodes });
  });
  return { rows, unparsed };
}

export type RosterPlayer = { id: string; name: string; number: string | null };
export type Match = { playerId: string; by: "name" | "number" } | null;

function normName(value: string) {
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
