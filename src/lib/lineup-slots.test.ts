import { describe, expect, it } from "vitest";
import { ALL_LINEUP_SLOTS, clampExtraMids, fieldFormatLabel, formatAllowsExtraMids, formatAllowsSubs, isExtraMidKey, isSubSlotKey, slotKeysFor, slotsFor } from "./lineup-slots";

const count = (slots: readonly { unit: string }[], unit: string) => slots.filter((s) => s.unit === unit).length;

describe("lineup slots by format and gender", () => {
  it("gives a girls field game 12 starters", () => {
    const s = slotsFor("field", "girls");
    expect(s).toHaveLength(12);
    expect(count(s, "Attack")).toBe(4);
    expect(count(s, "Midfield")).toBe(3);
    expect(count(s, "Defense")).toBe(4);
    expect(count(s, "Goalie")).toBe(1);
  });

  it("gives a boys field game 3 attack, 3 midfield, 3 defense and 1 goalie", () => {
    const s = slotsFor("field", "boys");
    expect(s).toHaveLength(10);
    expect(count(s, "Attack")).toBe(3);
    expect(count(s, "Midfield")).toBe(3);
    expect(count(s, "Defense")).toBe(3);
    expect(count(s, "Goalie")).toBe(1);
  });

  it("keeps sixes and sevens the same for both genders", () => {
    expect(slotsFor("sixes", "boys")).toHaveLength(6);
    expect(slotsFor("sixes", "girls")).toHaveLength(6);
    expect(slotsFor("sevens", "boys")).toHaveLength(8);
    expect(slotsFor("sevens", "girls")).toHaveLength(8);
  });

  it("falls back to the girls field set for unknown values", () => {
    expect(slotsFor("field", "")).toHaveLength(12);
    expect(slotsFor("nonsense", "boys")).toHaveLength(10);
  });

  it("never reuses a slot key between a girls and a boys field lineup", () => {
    const girls = slotKeysFor("field", "girls");
    for (const k of slotKeysFor("field", "boys")) expect(girls.has(k)).toBe(false);
  });

  it("has unique keys across every slot set", () => {
    const keys = ALL_LINEUP_SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("adds 2 attack, 3 midfield and 2 defense subs to field and sevens games when subs are on", () => {
    for (const [format, gender, starters] of [
      ["field", "girls", 12],
      ["field", "boys", 10],
      ["sevens", "girls", 8],
    ] as const) {
      const s = slotsFor(format, gender, true);
      const subs = s.filter((x) => x.sub);
      expect(s).toHaveLength(starters + 7);
      expect(count(subs, "Attack")).toBe(2);
      expect(count(subs, "Midfield")).toBe(3);
      expect(count(subs, "Defense")).toBe(2);
      expect(subs.every((x) => x.unit !== "Goalie")).toBe(true);
      expect(slotsFor(format, gender, false).some((x) => x.sub)).toBe(false);
    }
  });

  it("never gives sixes games subs", () => {
    expect(formatAllowsSubs("sixes")).toBe(false);
    expect(slotsFor("sixes", "girls", true)).toHaveLength(6);
    expect(slotKeysFor("field", "girls", true).has("XA1")).toBe(true);
    expect(slotKeysFor("field", "girls", false).has("XA1")).toBe(false);
  });

  it("labels the field format by gender", () => {
    expect(fieldFormatLabel("boys")).toBe("Field (10 starters)");
    expect(fieldFormatLabel("girls")).toBe("Field (12 starters)");
  });
});

describe("isSubSlotKey", () => {
  it("is true for every sub spot and false for every starting spot", () => {
    for (const s of ALL_LINEUP_SLOTS) expect(isSubSlotKey(s.key)).toBe(!!s.sub);
  });

  it("matches the 'X' prefix the database's one_sub_slot_per_player index relies on", () => {
    for (const s of ALL_LINEUP_SLOTS) expect(s.key.startsWith("X")).toBe(!!s.sub);
  });
});

describe("extra midfield lines", () => {
  const keys = (format: string, gender: string, subs: boolean, n: number) => slotsFor(format, gender, subs, n).map((s) => s.key);

  it("adds a line of three middies (4-6) right after Middie 3, then a second line (7-9)", () => {
    const one = keys("field", "girls", false, 1);
    expect(one.slice(one.indexOf("M3"), one.indexOf("M3") + 4)).toEqual(["M3", "M4", "M5", "M6"]);
    expect(one).toHaveLength(15);
    expect(one).not.toContain("M7");
    const two = keys("field", "girls", false, 2);
    expect(two.slice(two.indexOf("M3"), two.indexOf("M3") + 7)).toEqual(["M3", "M4", "M5", "M6", "M7", "M8", "M9"]);
    expect(two).toHaveLength(18);
    expect(keys("field", "girls", false, 0)).toHaveLength(12);
  });

  it("uses each format's own keys", () => {
    expect(keys("field", "boys", false, 2)).toEqual(expect.arrayContaining(["BM4", "BM5", "BM6", "BM7", "BM8", "BM9"]));
    expect(keys("sevens", "girls", false, 1)).toEqual(expect.arrayContaining(["7M4", "7M5", "7M6"]));
    expect(keys("field", "boys", false, 2)).not.toContain("M4");
  });

  it("works with or without subs, with the sub spots staying after the starters", () => {
    const withSubs = keys("field", "girls", true, 2);
    expect(withSubs).toHaveLength(12 + 6 + 7);
    expect(withSubs.indexOf("M9")).toBeLessThan(withSubs.indexOf("XA1"));
    expect(keys("field", "girls", false, 2)).not.toContain("XM1");
  });

  it("sixes has no midfield to add to, and the count is kept between 0 and 2", () => {
    expect(formatAllowsExtraMids("sixes")).toBe(false);
    expect(formatAllowsExtraMids("field")).toBe(true);
    expect(keys("sixes", "girls", false, 2)).toHaveLength(6);
    expect(clampExtraMids(5)).toBe(2);
    expect(clampExtraMids(-1)).toBe(0);
    expect(clampExtraMids(1.9)).toBe(1);
    expect(clampExtraMids(Number.NaN)).toBe(0);
  });

  it("the extra middies are not subs and not starts, and are labelled in history and exports", () => {
    expect(isSubSlotKey("M4")).toBe(false);
    expect(isExtraMidKey("M4")).toBe(true);
    expect(isExtraMidKey("BM9")).toBe(true);
    expect(isExtraMidKey("M3")).toBe(false);
    expect(isExtraMidKey("XM1")).toBe(false);
    expect(ALL_LINEUP_SLOTS.find((x) => x.key === "BM5")?.label).toBe("Middie 5");
    expect(slotKeysFor("field", "girls", false, 1).has("M6")).toBe(true);
    expect(slotKeysFor("field", "girls", false, 1).has("M7")).toBe(false);
  });
});
