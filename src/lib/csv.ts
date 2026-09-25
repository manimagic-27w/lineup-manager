import { z } from "zod";
import { POSITIONS } from "./db/schema";

const importRowSchema = z.object({
  name: z.string().trim().min(1),
  number: z.string().trim().optional(),
  position: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  experience: z.string().trim().optional(),
});

export type ParsedRosterRow = z.infer<typeof importRowSchema>;

/**
 * Parses pasted roster CSV text into validated rows. Header row is optional - if the first
 * line doesn't look like a header (no "name" column), every line is treated as data using the
 * default column order. Rows without a name are dropped rather than failing the whole import.
 * Pulled out of the `importRosterCsv` server action so it's covered by plain unit tests
 * without needing a database.
 */
export function parseRosterCsv(csv: string): ParsedRosterRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const hasHeader = header.includes("name");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const columns = hasHeader ? header : ["name", "number", "position", "grade", "experience"];

  return dataLines
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const record: Record<string, string> = {};
      columns.forEach((col, i) => {
        if (cells[i] !== undefined) record[col] = cells[i];
      });
      return record;
    })
    .map((r) => importRowSchema.safeParse(r))
    .filter((r): r is { success: true; data: ParsedRosterRow } => r.success)
    .map((r) => r.data);
}

export function normalizePosition(value: string | undefined): string | null {
  if (!value) return null;
  return (POSITIONS as readonly string[]).includes(value) ? value : null;
}

function csvEscape(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serializes an array of flat objects into CSV text (header row from the first object's
 *  keys). Used by the roster export route - kept dependency-free so it's easy to unit test. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}
