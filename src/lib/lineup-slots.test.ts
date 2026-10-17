import { describe, expect, it } from "vitest";
import { ALL_LINEUP_SLOTS, fieldFormatLabel, formatAllowsSubs, slotKeysFor, slotsFor } from "./lineup-slots";

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
