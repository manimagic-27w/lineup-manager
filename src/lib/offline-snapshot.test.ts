import { describe, expect, it } from "vitest";
import { SIXES_SLOTS, SLOTS } from "./db/schema";
import { buildOfflineGame, buildOfflinePractice, gameFormatLabel } from "./offline-snapshot";

const roster = [
  { id: "a", name: "Ava", number: "7", isGuest: false, archivedAt: null },
  { id: "b", name: "Bea", number: null, isGuest: false, archivedAt: null },
  { id: "c", name: "Cy", number: null, isGuest: false, archivedAt: null },
  { id: "g", name: "Gia", number: "3", isGuest: true, archivedAt: null },
  { id: "h", name: "Hal", number: null, isGuest: true, archivedAt: null }, // guest not on this game
  { id: "z", name: "Zed", number: null, isGuest: false, archivedAt: new Date() }, // archived
];
const game = { id: "g1", date: "2026-10-17", opponent: "Rival", notes: "Bring white jerseys" };

describe("buildOfflineGame", () => {
  const built = buildOfflineGame({
    game,
    formatLabel: "Field (12 starters)",
    tournament: null,
    roster,
    availability: [
      { playerId: "a", status: "Available" },
      { playerId: "b", status: "Not Available" },
      { playerId: "g", status: "Maybe" },
    ],
    lineup: [
      { slotKey: "G1", playerId: "a" },
      { slotKey: "M1", playerId: "b" }, // penciled in but not available
    ],
    slots: SLOTS,
  });

  it("groups slots by unit in order and names the players", () => {
    expect(built.units.map((u) => u.unit)).toEqual(["Attack", "Midfield", "Defense", "Goalie"]);
    expect(built.units[3].slots).toEqual([{ label: "Goalie", player: "Ava #7", warn: false }]);
  });

  it("flags a starter who is no longer available", () => {
    expect(built.units[1].slots[0]).toEqual({ label: "Middie 1", player: "Bea", warn: true });
    expect(built.units[1].slots[1]).toEqual({ label: "Middie 2", player: null, warn: false });
  });

  it("benches available/maybe players not starting, tags guests, skips archived and unattached guests", () => {
    expect(built.bench).toEqual(["Gia #3 (guest)"]);
    const all = built.availability.flatMap((a) => a.players);
    expect(all).not.toContain("Zed");
    expect(all).not.toContain("Hal (guest)");
  });

  it("lists everyone under their availability status, defaulting to No Response", () => {
    const by = Object.fromEntries(built.availability.map((a) => [a.status, a.players]));
    expect(by["Available"]).toEqual(["Ava #7"]);
    expect(by["Not Available"]).toEqual(["Bea"]);
    expect(by["Maybe"]).toEqual(["Gia #3 (guest)"]);
    expect(by["No Response"]).toEqual(["Cy"]);
  });

  it("works for sixes and labels formats", () => {
    const sixes = buildOfflineGame({ game, formatLabel: "x", tournament: "Spring Classic", roster, availability: [], lineup: [], slots: SIXES_SLOTS });
    expect(sixes.units.length).toBeGreaterThan(0);
    expect(sixes.tournament).toBe("Spring Classic");
    expect(gameFormatLabel("sixes", "girls")).toBe("Sixes (6 a side)");
    expect(gameFormatLabel("sevens", "boys")).toBe("Sevens (8 a side)");
    expect(gameFormatLabel("field", "boys")).toBe("Field (10 starters)");
  });
});

describe("buildOfflinePractice", () => {
  it("works out clock times and the total from the start time", () => {
    const built = buildOfflinePractice({
      plan: { id: "p1", title: "Ground balls", practiceDate: "2026-10-20", startTime: "18:00", goals: "Scoop", tags: ["Ground balls"] },
      items: [
        { name: "Warm-up", minutes: 10, notes: "" },
        { name: "Box GBs", minutes: 20, notes: "Low hands" },
      ],
    });
    expect(built.totalMinutes).toBe(30);
    expect(built.items.map((i) => i.time)).toEqual(["6:00 PM", "6:10 PM"]);
    expect(built.items[1].notes).toBe("Low hands");
  });

  it("leaves times empty without a start time", () => {
    const built = buildOfflinePractice({
      plan: { id: "p2", title: "x", practiceDate: null, startTime: null, goals: "", tags: [] },
      items: [{ name: "A", minutes: 5, notes: "" }],
    });
    expect(built.items[0].time).toBeNull();
  });
});
