import { describe, expect, it } from "vitest";
import { crossCheck, matchPlayer, parseStatText, summarizePeriods, withGoalieStats } from "./stat-import";

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

const FULL = `3d Virginia Orange
2026-10-25 · vs Limelight 32 · 6–4 (Final)

#9 Lilly Brosseau: 2 G, 0 A, 3 SH, 1 GB, 1 DC, 0 CT, 0 TO
#13 Kaylee Brown: 1 G, 0 A, 1 SH, 0 GB, 0 DC, 0 CT, 0 TO
#18 Lola Alifano: 1 G, 0 A, 1 SH, 0 GB, 0 DC, 0 CT, 2 TO
#24 Madigan Kuper: 0 G, 2 A, 0 SH, 0 GB, 0 DC, 0 CT, 0 TO
#25 Lylah Klinger: 2 G, 0 A, 2 SH, 0 GB, 1 DC, 0 CT, 0 TO
#27 Avery Zech: 0 G, 0 A, 1 SH, 0 GB, 0 DC, 0 CT, 0 TO

PLAY-BY-PLAY (approximate game time)
1st half · 19:36 remaining · 0:24 elapsed — Draw control — Lylah Klinger
1st half · 18:47 remaining · 1:13 elapsed — Goalie save — Avery Zech
1st half · 17:37 remaining · 2:23 elapsed — Goal — Lola Alifano
1st half · 17:27 remaining · 2:33 elapsed — Assist — Madigan Kuper
1st half · 16:13 remaining · 3:47 elapsed — Shot saved — Avery Zech
1st half · 15:18 remaining · 4:42 elapsed — Turnover — Lola Alifano
1st half · 12:54 remaining · 7:06 elapsed — Turnover — Lola Alifano
1st half · 3:29 remaining · 16:31 elapsed — Goal — Lilly Brosseau
1st half · 3:25 remaining · 16:35 elapsed — Assist — Madigan Kuper
2nd half · 20:00 remaining · 0:00 elapsed (paused) — Goal allowed — Avery Zech
2nd half · 16:45 remaining · 3:15 elapsed — Goal — Lylah Klinger
2nd half · 15:46 remaining · 4:14 elapsed — Goalie save — Avery Zech
2nd half · 15:45 remaining · 4:15 elapsed — Goal allowed — Avery Zech
2nd half · 15:02 remaining · 4:58 elapsed — Goal — Lilly Brosseau
2nd half · 11:49 remaining · 8:11 elapsed — Goal allowed — Avery Zech
2nd half · 8:31 remaining · 11:29 elapsed — Goal — Kaylee Brown
2nd half · 7:31 remaining · 12:29 elapsed — Ground ball — Lilly Brosseau
2nd half · 7:30 remaining · 12:30 elapsed — Draw control — Lilly Brosseau
2nd half · 6:59 remaining · 13:01 elapsed — Goal — Lylah Klinger
2nd half · 4:25 remaining · 15:35 elapsed — Shot wide / post — Lilly Brosseau
2nd half · 3:47 remaining · 16:13 elapsed — Goal allowed — Avery Zech

Unofficial sideline stats. Shots include goals; goalie save % uses credited saves and goals allowed. Zero means no recorded event, not confirmed playing time.`;

describe("full stat-keeper text", () => {
  const parsed = parseStatText(FULL);
  it("separates player lines, events, header score and footer", () => {
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.events).toHaveLength(21);
    expect(parsed.score).toEqual([6, 4]);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.rows.every((r) => r.unknownCodes.length === 0)).toBe(true);
  });
  it("reads event details", () => {
    expect(parsed.events[0]).toMatchObject({ period: 1, kind: "draw_control", name: "Lylah Klinger", remainingSec: 1176, elapsedSec: 24, paused: false });
    expect(parsed.events[9]).toMatchObject({ period: 2, paused: true, kind: "goal_allowed" });
    expect(parsed.events.find((e) => e.label === "Shot wide / post")?.kind).toBe("shot_wide");
  });
  it("adds the goalie's saves and goals allowed from the events", () => {
    const rows = withGoalieStats(parsed.rows, parsed.events);
    expect(rows.find((r) => r.name === "Avery Zech")?.stats).toMatchObject({ shots: 1, saves: 2, goals_allowed: 4 });
  });
  it("finds no disagreements when the two sections agree", () => {
    expect(crossCheck(parsed.rows, parsed.events, null)).toEqual([]);
  });
  it("flags a box score that disagrees with the events", () => {
    const wrong = parseStatText(FULL.replace("#9 Lilly Brosseau: 2 G", "#9 Lilly Brosseau: 3 G"));
    expect(crossCheck(wrong.rows, wrong.events, null).join(" ")).toMatch(/Lilly Brosseau: Goals is 3 in the box score but 2/);
  });
  it("summarizes goals by half", () => {
    expect(summarizePeriods(parsed.events)).toEqual([
      { period: 1, label: "1st half", goalsFor: 2, goalsAgainst: 0 },
      { period: 2, label: "2nd half", goalsFor: 4, goalsAgainst: 4 },
    ]);
  });
  it("gives a goalie who isn't in the box score her own row", () => {
    const rows = withGoalieStats(parseStatText("#9 Lilly Brosseau: 1 G").rows, parsed.events);
    expect(rows.find((r) => r.name === "Avery Zech")?.stats).toEqual({ saves: 2, goals_allowed: 4 });
  });
});
