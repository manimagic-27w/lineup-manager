import { describe, expect, it } from "vitest";
import { groupGamesByTournament, orderImportSources } from "./tournament-groups";

const g = (id: string, date: string, tournamentId: string | null = null) => ({ id, date, tournamentId });
const T1 = { id: "t1", name: "Spring Classic" };
const T2 = { id: "t2", name: "Summer Shootout" };

describe("groupGamesByTournament", () => {
  it("returns one ungrouped group when there are no tournaments", () => {
    const games = [g("a", "2026-05-02"), g("b", "2026-05-01")];
    expect(groupGamesByTournament(games, [])).toEqual([{ tournament: null, games }]);
  });

  it("groups by tournament, newest tournament first, ungrouped last", () => {
    const games = [
      g("a", "2026-07-02", "t2"),
      g("b", "2026-06-20"),
      g("c", "2026-05-03", "t1"),
      g("d", "2026-05-02", "t1"),
      g("e", "2026-07-01", "t2"),
    ];
    const groups = groupGamesByTournament(games, [T1, T2]);
    expect(groups.map((x) => x.tournament?.name ?? null)).toEqual(["Summer Shootout", "Spring Classic", null]);
    expect(groups[0].games.map((x) => x.id)).toEqual(["a", "e"]);
    expect(groups[1].games.map((x) => x.id)).toEqual(["c", "d"]);
    expect(groups[2].games.map((x) => x.id)).toEqual(["b"]);
  });

  it("drops tournaments with no games and treats unknown tournament ids as ungrouped", () => {
    const groups = groupGamesByTournament([g("a", "2026-05-01", "gone")], [T1]);
    expect(groups).toEqual([{ tournament: null, games: [g("a", "2026-05-01", "gone")] }]);
  });
});

describe("orderImportSources", () => {
  const current = g("cur", "2026-05-10", "t1");

  it("excludes the current game", () => {
    expect(orderImportSources([current, g("x", "2026-05-09")], current).map((x) => x.id)).toEqual(["x"]);
  });

  it("puts same-tournament games first, closest date first, then the rest newest-first", () => {
    const games = [
      g("old", "2026-03-01"),
      g("t-far", "2026-05-01", "t1"),
      g("recent", "2026-05-09"),
      g("t-near", "2026-05-11", "t1"),
      g("other-tournament", "2026-04-01", "t2"),
    ];
    expect(orderImportSources(games, current).map((x) => x.id)).toEqual([
      "t-near",
      "t-far",
      "recent",
      "other-tournament",
      "old",
    ]);
  });

  it("treats a game with no tournament as having no same-tournament matches", () => {
    const noT = g("cur", "2026-05-10");
    const out = orderImportSources([g("a", "2026-05-09"), g("b", "2026-05-11")], noT);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
