import { describe, expect, it } from "vitest";
import { SLOTS, POSITIONS, AVAILABILITY_STATUSES, DEFAULT_STAT_CATEGORIES } from "./schema";

describe("SLOTS", () => {
  it("has exactly 12 lineup slots (the Sheets version's fixed roster size)", () => {
    expect(SLOTS).toHaveLength(12);
  });

  it("has unique slot keys", () => {
    const keys = SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only uses positions from the shared POSITIONS list", () => {
    for (const slot of SLOTS) {
      expect(POSITIONS as readonly string[]).toContain(slot.pos);
    }
  });

  it("has 4 attack, 3 midfield, 4 defense, and 1 goalie slot", () => {
    const byUnit = SLOTS.reduce<Record<string, number>>((acc, s) => {
      acc[s.unit] = (acc[s.unit] ?? 0) + 1;
      return acc;
    }, {});
    expect(byUnit).toEqual({ Attack: 4, Midfield: 3, Defense: 4, Goalie: 1 });
  });
});

describe("AVAILABILITY_STATUSES", () => {
  it("includes the four statuses the app's forms and blackout logic rely on", () => {
    expect(AVAILABILITY_STATUSES).toEqual(["Available", "Not Available", "Maybe", "No Response"]);
  });
});

describe("DEFAULT_STAT_CATEGORIES", () => {
  it("seeds the five basic categories from the original spec", () => {
    expect(DEFAULT_STAT_CATEGORIES.map((c) => c.label)).toEqual([
      "Goals",
      "Assists",
      "Ground Balls",
      "Saves",
      "Forced Turnovers",
    ]);
  });

  it("has unique, code-safe keys", () => {
    const keys = DEFAULT_STAT_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9_]+$/);
  });
});
