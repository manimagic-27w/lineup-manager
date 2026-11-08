import { describe, expect, it } from "vitest";
import { buildFilmIndex, resultText } from "./film-index";

const base = { opponent: "Opp", ourScore: null, opponentScore: null, isFriendly: false, seasonId: null, tournamentId: null, filmUrl: "youtu.be/x" };
const row = (o: Partial<Parameters<typeof buildFilmIndex>[0][number]> & { id: string; date: string }) => ({ ...base, ...o });

describe("resultText", () => {
  it("formats W/L/T and hides when no score", () => {
    expect(resultText(8, 5)).toBe("W 8-5");
    expect(resultText(3, 9)).toBe("L 3-9");
    expect(resultText(4, 4)).toBe("T 4-4");
    expect(resultText(null, 4)).toBeNull();
  });
});

describe("buildFilmIndex", () => {
  const seasons = new Map([["s1", "Fall 2026"], ["s0", "Spring 2026"]]);
  const tourneys = new Map([["t1", "Fall Classic"]]);

  it("only includes games with a video link and adds https", () => {
    const out = buildFilmIndex([row({ id: "a", date: "2026-10-01" }), row({ id: "b", date: "2026-10-02", filmUrl: null }), row({ id: "c", date: "2026-10-03", filmUrl: "  " })], seasons, tourneys);
    expect(out).toHaveLength(1);
    expect(out[0].tournaments[0].games.map((g) => g.id)).toEqual(["a"]);
    expect(out[0].tournaments[0].games[0].href).toBe("https://youtu.be/x");
  });

  it("groups by season (newest first, none last) and tournament, newest game first", () => {
    const out = buildFilmIndex(
      [
        row({ id: "old", date: "2026-04-01", seasonId: "s0" }),
        row({ id: "n1", date: "2026-10-01", seasonId: "s1" }),
        row({ id: "t2", date: "2026-10-09", seasonId: "s1", tournamentId: "t1" }),
        row({ id: "t1", date: "2026-10-08", seasonId: "s1", tournamentId: "t1" }),
        row({ id: "free", date: "2026-11-01" }),
      ],
      seasons,
      tourneys,
    );
    expect(out.map((s) => s.name)).toEqual(["Fall 2026", "Spring 2026", null]);
    const fall = out[0];
    expect(fall.tournaments.map((t) => t.name)).toEqual([null, "Fall Classic"]);
    expect(fall.tournaments[1].games.map((g) => g.id)).toEqual(["t2", "t1"]);
  });
});
