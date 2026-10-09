import { describe, expect, it } from "vitest";
import { computeRecord, formatRecord, gameOutcome } from "./game-record";

const g = (ourScore: number | null, opponentScore: number | null, isFriendly = false) => ({
  ourScore,
  opponentScore,
  isFriendly,
});

describe("gameOutcome", () => {
  it("returns W / L / T from the score", () => {
    expect(gameOutcome(g(10, 8))).toBe("W");
    expect(gameOutcome(g(7, 9))).toBe("L");
    expect(gameOutcome(g(5, 5))).toBe("T");
  });

  it("treats 0-0 as a tie, not as missing", () => {
    expect(gameOutcome(g(0, 0))).toBe("T");
  });

  it("returns null until a full score is recorded", () => {
    expect(gameOutcome(g(null, null))).toBeNull();
    expect(gameOutcome(g(3, null))).toBeNull();
  });
});

describe("computeRecord", () => {
  it("counts wins, losses and ties", () => {
    expect(computeRecord([g(10, 8), g(7, 9), g(5, 5), g(12, 1)])).toEqual({
      wins: 2,
      losses: 1,
      ties: 1,
      friendlies: 0,
    });
  });

  it("leaves friendlies out of the record but counts them separately", () => {
    expect(computeRecord([g(10, 8), g(2, 9, true), g(9, 1, true)])).toEqual({
      wins: 1,
      losses: 0,
      ties: 0,
      friendlies: 2,
    });
  });

  it("ignores games without a final score", () => {
    expect(computeRecord([g(null, null), g(null, null, true), g(4, 3)])).toEqual({
      wins: 1,
      losses: 0,
      ties: 0,
      friendlies: 0,
    });
  });
});

describe("formatRecord", () => {
  it("omits ties when there are none", () => {
    expect(formatRecord({ wins: 5, losses: 2, ties: 0 })).toBe("5-2");
    expect(formatRecord({ wins: 5, losses: 2, ties: 1 })).toBe("5-2-1");
  });
});
