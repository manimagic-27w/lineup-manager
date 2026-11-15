import { describe, expect, it } from "vitest";
import {
  canHaveStats,
  coreThenGuests,
  findGuestByName,
  guestsAvailableForGame,
  matchesCorePlayer,
  normalizeName,
  splitGuests,
  statDisplayName,
} from "./guests";

const p = (id: string, name: string, isGuest: boolean, archivedAt: Date | null = null) => ({
  id,
  name,
  isGuest,
  archivedAt,
});

const all = [p("1", "Ava Core", false), p("2", "Gia Guest", true), p("3", "Zed Core", false), p("4", "Old Guest", true, new Date())];

describe("guests", () => {
  it("normalizes names", () => {
    expect(normalizeName("  jordan   REYES ")).toBe("jordan reyes");
  });

  it("splits and orders core before guests", () => {
    const { core, guests } = splitGuests(all);
    expect(core.map((x) => x.id)).toEqual(["1", "3"]);
    expect(guests.map((x) => x.id)).toEqual(["2", "4"]);
    expect(coreThenGuests([all[1], all[0], all[3], all[2]]).map((x) => x.id)).toEqual(["1", "3", "2", "4"]);
  });

  it("finds an existing guest by name, ignoring case and spacing, but never a core player", () => {
    expect(findGuestByName(all, " gia  GUEST")?.id).toBe("2");
    expect(findGuestByName(all, "Ava Core")).toBeUndefined();
    expect(findGuestByName(all, "Old Guest")?.id).toBe("4"); // archived guests can be found (and restored)
  });

  it("detects a name that belongs to the core roster", () => {
    expect(matchesCorePlayer(all, "ava core")).toBe(true);
    expect(matchesCorePlayer(all, "Gia Guest")).toBe(false);
  });

  it("offers only unarchived guests that are not already on the game", () => {
    expect(guestsAvailableForGame(all, new Set()).map((x) => x.id)).toEqual(["2"]);
    expect(guestsAvailableForGame(all, new Set(["2"]))).toEqual([]);
  });
});

describe("stats eligibility", () => {
  it("core players always can; guests only once they are on a game; archived never", () => {
    expect(canHaveStats(p("a", "Core", false), false)).toBe(true);
    expect(canHaveStats(p("b", "Guest", true), false)).toBe(false);
    expect(canHaveStats(p("b", "Guest", true), true)).toBe(true);
    expect(canHaveStats(p("c", "Old", false, new Date()), true)).toBe(false);
    expect(canHaveStats(p("d", "OldGuest", true, new Date()), true)).toBe(false);
  });

  it("tags guests in the display name", () => {
    expect(statDisplayName({ name: "Jordan", isGuest: true })).toBe("Jordan (guest)");
    expect(statDisplayName({ name: "Jordan", isGuest: false })).toBe("Jordan");
  });
});
