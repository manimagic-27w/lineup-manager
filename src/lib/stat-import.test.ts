import { describe, expect, it } from "vitest";
import { matchPlayer, parseStatText } from "./stat-import";

const SAMPLE = `#1 Juliet Willis: 0 G, 0 A, 0 SH, 0 GB, 0 DC, 2 CT, 0 TO
#9 Lilly Brosseau: 2 G, 0 A, 3 SH, 1 GB, 1 DC, 0 CT, 0 TO
#18 Lola Alifano: 1 G, 0 A, 1 SH, 0 GB, 0 DC, 0 CT, 2 TO`;

describe("parseStatText", () => {
  it("reads number, name and every stat", () => {
    const { rows, unparsed } = parseStatText(SAMPLE);
    expect(unparsed).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ number: "1", name: "Juliet Willis", stats: { caused_turnovers: 2, goals: 0 } });
    expect(rows[1].stats).toMatchObject({ goals: 2, shots: 3, gb: 1, draw_controls: 1 });
    expect(rows[2].stats.turnovers).toBe(2);
  });
  it("accepts goalie stats, lowercase codes and Windows line endings", () => {
    const { rows } = parseStatText("#80 Haddie Currera: 7 sv, 3 GA\r\n");
    expect(rows[0].stats).toEqual({ saves: 7, goals_allowed: 3 });
  });
  it("flags unknown codes and unreadable lines", () => {
    const { rows, unparsed } = parseStatText("#5 Shelby Howard: 1 CT, 2 ZZ\nhello there");
    expect(rows[0].unknownCodes).toEqual(["ZZ"]);
    expect(unparsed).toHaveLength(1);
  });
  it("works without a jersey number", () => {
    expect(parseStatText("Tess Suddarth: 1 G").rows[0]).toMatchObject({ number: null, name: "Tess Suddarth" });
  });
});

describe("matchPlayer", () => {
  const roster = [
    { id: "a", name: "Lilly Brosseau", number: "9" },
    { id: "b", name: "Lola Alifano", number: "#18" },
    { id: "c", name: "Sam Twin", number: "4" },
    { id: "d", name: "Sam Twin", number: "5" },
  ];
  it("matches by name ignoring case and punctuation", () => {
    expect(matchPlayer({ name: "lilly  brosseau", number: "99" }, roster)).toEqual({ playerId: "a", by: "name" });
  });
  it("falls back to jersey number", () => {
    expect(matchPlayer({ name: "Lola A.", number: "18" }, roster)).toEqual({ playerId: "b", by: "number" });
  });
  it("refuses ambiguous names and unknown players", () => {
    expect(matchPlayer({ name: "Sam Twin", number: "4" }, roster)).toBeNull();
    expect(matchPlayer({ name: "Nobody", number: "77" }, roster)).toBeNull();
  });
});
