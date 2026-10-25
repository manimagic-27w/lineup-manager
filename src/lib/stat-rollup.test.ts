import { describe, expect, it } from "vitest";
import { filterGamesBySeason, formatStat, perGame, rollupPlayer } from "./stat-rollup";

const games = [
  { id: "g1", seasonId: "s1" },
  { id: "g2", seasonId: "s1" },
  { id: "g3", seasonId: null },
];

describe("filterGamesBySeason", () => {
  it("handles all, none and a season id", () => {
    expect(filterGamesBySeason(games, undefined)).toHaveLength(3);
    expect(filterGamesBySeason(games, "all")).toHaveLength(3);
    expect(filterGamesBySeason(games, "none").map((g) => g.id)).toEqual(["g3"]);
    expect(filterGamesBySeason(games, "s1").map((g) => g.id)).toEqual(["g1", "g2"]);
  });
});

describe("rollupPlayer", () => {
  const values = { "g1:p:goals": "2", "g1:p:shots": "3", "g2:p:goals": "0", "g3:p:goals": "1" };
  it("totals each category and counts games with stats", () => {
    const r = rollupPlayer("p", games, ["goals", "shots", "assists"], values);
    expect(r.totals).toEqual({ goals: 3, shots: 3, assists: 0 });
    expect(r.games).toBe(3); // a recorded 0 still counts as a game with stats
  });
  it("respects the game filter and ignores blanks", () => {
    const r = rollupPlayer("p", [games[2]], ["goals"], { ...values, "g3:p:goals": "" });
    expect(r).toEqual({ playerId: "p", games: 0, totals: { goals: 0 } });
  });
});

describe("formatting", () => {
  it("trims trailing zeros and guards divide by zero", () => {
    expect(formatStat(2)).toBe("2");
    expect(formatStat(2.333)).toBe("2.33");
    expect(perGame(5, 0)).toBe(0);
    expect(perGame(5, 2)).toBe(2.5);
  });
});
