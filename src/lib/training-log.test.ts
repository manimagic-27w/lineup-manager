import { describe, expect, it } from "vitest";
import {
  addDays,
  formatMinutes,
  formatPhone,
  lastFour,
  normalizePhone,
  isLoggableDate,
  parseRange,
  publicName,
  rangeStart,
  summarizeByPlayer,
  todayIn,
  weekdayName,
  weekStart,
} from "./training-log";

describe("publicName", () => {
  it("shortens to first name and last initial", () => {
    expect(publicName("Jordan Reyes")).toBe("Jordan R.");
    expect(publicName("  mary   jo smith ")).toBe("mary S.");
  });
  it("leaves a single name alone", () => {
    expect(publicName("Cher")).toBe("Cher");
    expect(publicName("")).toBe("");
  });
});

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("names the weekday", () => {
    expect(weekdayName("2026-10-24")).toBe("Saturday");
    expect(weekdayName("nope")).toBe("");
  });
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-24")).toBe("2026-10-19"); // Saturday
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
  });
  it("formats today in a time zone", () => {
    expect(todayIn("America/New_York", new Date("2026-10-25T03:30:00Z"))).toBe("2026-10-24");
  });
});

describe("isLoggableDate", () => {
  const today = "2026-10-24";
  it("accepts today, tomorrow (time zones) and the last 30 days", () => {
    expect(isLoggableDate("2026-10-24", today)).toBe(true);
    expect(isLoggableDate("2026-10-25", today)).toBe(true);
    expect(isLoggableDate("2026-09-24", today)).toBe(true);
  });
  it("rejects the far past, the future and junk", () => {
    expect(isLoggableDate("2026-09-23", today)).toBe(false);
    expect(isLoggableDate("2026-10-26", today)).toBe(false);
    expect(isLoggableDate("2026-02-30", today)).toBe(false);
    expect(isLoggableDate("10/24/2026", today)).toBe(false);
  });
});

describe("ranges", () => {
  it("defaults to this week", () => {
    expect(parseRange(undefined)).toBe("week");
    expect(parseRange("bogus")).toBe("week");
    expect(parseRange("30")).toBe("30");
  });
  it("starts each range on the right day", () => {
    const today = "2026-10-24";
    expect(rangeStart("week", today)).toBe("2026-10-19");
    expect(rangeStart("7", today)).toBe("2026-10-18");
    expect(rangeStart("30", today)).toBe("2026-09-25");
    expect(rangeStart("all", today)).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("reads naturally", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(95)).toBe("1h 35m");
  });
});

describe("summarizeByPlayer", () => {
  it("counts approved time only and reports the rest as pending", () => {
    const s = summarizeByPlayer(["a", "b", "c"], [
      { playerId: "a", logDate: "2026-10-20", minutes: 30, kind: "Wall Ball", approved: true },
      { playerId: "a", logDate: "2026-10-22", minutes: 45, kind: "Shooting", approved: true },
      { playerId: "a", logDate: "2026-10-21", minutes: 15, kind: "Wall Ball", approved: true },
      { playerId: "a", logDate: "2026-10-23", minutes: 20, kind: "Dodging", approved: false },
      { playerId: "b", logDate: "2026-10-23", minutes: 60, kind: "Private Training", approved: false },
      { playerId: "zzz", logDate: "2026-10-23", minutes: 99, kind: "Wall Ball", approved: true },
    ]);
    expect(s.get("a")).toMatchObject({
      totalMinutes: 90,
      pendingMinutes: 20,
      sessions: 3,
      lastLogged: "2026-10-22",
      byKind: { "Wall Ball": 45, Shooting: 45 },
    });
    expect(s.get("b")).toMatchObject({ totalMinutes: 0, pendingMinutes: 60, sessions: 0, lastLogged: null });
    expect(s.get("c")).toMatchObject({ totalMinutes: 0, pendingMinutes: 0, sessions: 0, lastLogged: null });
    expect(s.has("zzz")).toBe(false);
  });
});

describe("phone numbers", () => {
  it("normalizes US mobile numbers", () => {
    expect(normalizePhone("(703) 555-0142")).toBe("+17035550142");
    expect(normalizePhone("1-703-555-0142")).toBe("+17035550142");
    expect(normalizePhone("703.555.0142")).toBe("+17035550142");
  });
  it("rejects numbers that can't be real", () => {
    expect(normalizePhone("555-0142")).toBeNull();
    expect(normalizePhone("0035550142")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("formats for display", () => {
    expect(formatPhone("+17035550142")).toBe("(703) 555-0142");
    expect(lastFour("+17035550142")).toBe("0142");
  });
});
