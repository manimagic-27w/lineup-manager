import { describe, expect, it } from "vitest";
import { parseRosterCsv, normalizePosition, toCsv } from "./csv";

describe("parseRosterCsv", () => {
  it("parses a full header row", () => {
    const rows = parseRosterCsv(
      "name,number,position,grade,experience\nJordan Reyes,7,Attack,11,3 years\nCasey Kim,,,,"
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "Jordan Reyes",
      number: "7",
      position: "Attack",
      grade: "11",
      experience: "3 years",
    });
    expect(rows[1].name).toBe("Casey Kim");
  });

  it("falls back to the default column order when there's no header", () => {
    const rows = parseRosterCsv("Riley Shaw,23,Mid,10,2 years");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Riley Shaw");
    expect(rows[0].position).toBe("Mid");
  });

  it("drops rows without a name", () => {
    const rows = parseRosterCsv("name,number\nAlex Park,4\n,9\n  ,10");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alex Park");
  });

  it("returns an empty array for blank input", () => {
    expect(parseRosterCsv("")).toEqual([]);
    expect(parseRosterCsv("   \n  \n")).toEqual([]);
  });

  it("tolerates a header that only has some of the columns", () => {
    const rows = parseRosterCsv("name,number\nSam Lee,15");
    expect(rows[0]).toEqual({ name: "Sam Lee", number: "15" });
  });
});

describe("normalizePosition", () => {
  it("accepts known positions", () => {
    expect(normalizePosition("Attack")).toBe("Attack");
    expect(normalizePosition("Goalie")).toBe("Goalie");
  });

  it("rejects unknown or missing positions", () => {
    expect(normalizePosition("Striker")).toBeNull();
    expect(normalizePosition(undefined)).toBeNull();
    expect(normalizePosition("")).toBeNull();
  });

  it("maps common full-word spellings onto the canonical abbreviated values", () => {
    expect(normalizePosition("Midfield")).toBe("Mid");
    expect(normalizePosition("midfield")).toBe("Mid");
    expect(normalizePosition("Midfielder")).toBe("Mid");
    expect(normalizePosition("Defense")).toBe("Def");
    expect(normalizePosition("Defence")).toBe("Def");
    expect(normalizePosition("Defender")).toBe("Def");
    expect(normalizePosition("Goalkeeper")).toBe("Goalie");
    expect(normalizePosition("  Midfield  ")).toBe("Mid");
  });
});

describe("toCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("writes a header row from the first object's keys", () => {
    const csv = toCsv([{ name: "Jordan", number: "7" }]);
    expect(csv).toBe("name,number\nJordan,7");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = toCsv([{ notes: 'Line one, "quoted", line two\nmore' }]);
    expect(csv).toBe('notes\n"Line one, ""quoted"", line two\nmore"');
  });

  it("renders null/undefined as an empty cell", () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv).toBe("a,b,c\n,,0");
  });
});
