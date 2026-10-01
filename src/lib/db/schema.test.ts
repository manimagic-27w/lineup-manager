import { describe, expect, it } from "vitest";
import {
  SLOTS,
  SIXES_SLOTS,
  SEVENS_SLOTS,
  GAME_FORMATS,
  POSITIONS,
  AVAILABILITY_STATUSES,
  DEFAULT_STAT_CATEGORIES,
  leaningForPosition,
} from "./schema";

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

describe("SIXES_SLOTS", () => {
  it("has 5 flexible field slots and 1 goalie slot", () => {
    expect(SIXES_SLOTS).toHaveLength(6);
    const byUnit = SIXES_SLOTS.reduce<Record<string, number>>((acc, s) => {
      acc[s.unit] = (acc[s.unit] ?? 0) + 1;
      return acc;
    }, {});
    expect(byUnit).toEqual({ Sixes: 5, Goalie: 1 });
  });

  it("has unique slot keys, and none collide with the field lineup's SLOTS keys", () => {
    const keys = SIXES_SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const fieldKeys = new Set<string>(SLOTS.map((s) => s.key));
    for (const key of keys) expect(fieldKeys.has(key)).toBe(false);
  });
});

describe("SEVENS_SLOTS", () => {
  it("has 2 attack, 3 midfield, 2 defense, and 1 goalie slot", () => {
    expect(SEVENS_SLOTS).toHaveLength(8);
    const byUnit = SEVENS_SLOTS.reduce<Record<string, number>>((acc, s) => {
      acc[s.unit] = (acc[s.unit] ?? 0) + 1;
      return acc;
    }, {});
    expect(byUnit).toEqual({ Attack: 2, Midfield: 3, Defense: 2, Goalie: 1 });
  });

  it("only uses positions from the shared POSITIONS list, unlike SIXES_SLOTS", () => {
    for (const slot of SEVENS_SLOTS) {
      expect(POSITIONS as readonly string[]).toContain(slot.pos);
    }
  });

  it("has unique slot keys, and none collide with SLOTS or SIXES_SLOTS keys", () => {
    const keys = SEVENS_SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const otherKeys = new Set<string>([...SLOTS, ...SIXES_SLOTS].map((s) => s.key));
    for (const key of keys) expect(otherKeys.has(key)).toBe(false);
  });
});

describe("GAME_FORMATS", () => {
  it("is field, sixes, and sevens, with field first as the default", () => {
    expect(GAME_FORMATS).toEqual(["field", "sixes", "sevens"]);
  });
});

describe("leaningForPosition", () => {
  it("maps each roster position to its informal sixes leaning", () => {
    expect(leaningForPosition("Attack")).toBe("Offense-leaning");
    expect(leaningForPosition("Mid")).toBe("Two-way");
    expect(leaningForPosition("Def")).toBe("Defense-leaning");
    expect(leaningForPosition("Goalie")).toBe("Goalie");
  });

  it("returns null for no position or an unrecognized one", () => {
    expect(leaningForPosition(null)).toBeNull();
    expect(leaningForPosition(undefined)).toBeNull();
    expect(leaningForPosition("Something old and free-text")).toBeNull();
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
