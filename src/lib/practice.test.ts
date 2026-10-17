import { describe, expect, it } from "vitest";
import { clockTimes, formatClock, normalizeTags, parseStartTime, totalMinutes } from "./practice";

describe("practice helpers", () => {
  it("normalizes tags: trims, dedupes case-insensitively, caps count and length", () => {
    expect(normalizeTags(" Ground balls, shooting ,ground  BALLS,, Clears ")).toEqual(["Ground balls", "shooting", "Clears"]);
    expect(normalizeTags(["A", "a", "B"])).toEqual(["A", "B"]);
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(8);
    expect(normalizeTags("x".repeat(80))[0]).toHaveLength(30);
    expect(normalizeTags(null)).toEqual([]);
  });

  it("totals minutes", () => {
    expect(totalMinutes([{ minutes: 10 }, { minutes: 15 }, { minutes: 5 }])).toBe(30);
    expect(totalMinutes([])).toBe(0);
  });

  it("parses and formats clock times", () => {
    expect(parseStartTime("18:05")).toBe(1085);
    expect(parseStartTime("24:00")).toBeNull();
    expect(parseStartTime("6pm")).toBeNull();
    expect(parseStartTime("")).toBeNull();
    expect(formatClock(1085)).toBe("6:05 PM");
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(720)).toBe("12:00 PM");
    expect(formatClock(1439 + 2)).toBe("12:01 AM");
  });

  it("lays out drill start times from the plan start", () => {
    expect(clockTimes("18:00", [10, 15, 20])).toEqual(["6:00 PM", "6:10 PM", "6:25 PM"]);
    expect(clockTimes(null, [10, 10])).toEqual([null, null]);
    expect(clockTimes("bad", [5])).toEqual([null]);
  });
});
