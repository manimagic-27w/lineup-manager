import { describe, expect, it } from "vitest";
import { collectActivityRefs, describeActivity, type ActivityRefs } from "./activity-format";

const P1 = "11111111-1111-4111-8111-111111111111";
const G1 = "22222222-2222-4222-8222-222222222222";
const U1 = "user_abc";

const refs = (): ActivityRefs => ({
  players: new Map([[P1, "Jordan Reyes"]]),
  games: new Map([[G1, { date: "2026-10-03", opponent: "Eagles" }]]),
  users: new Map([[U1, "Sam Coach"]]),
});

describe("describeActivity", () => {
  it("describes availability changes by player and game name", () => {
    const d = JSON.stringify({ playerId: P1, gameId: G1, status: "Available" });
    const out = describeActivity("availability_set", d, refs());
    expect(out).toContain("marked Jordan Reyes as Available for the game on");
    expect(out).toContain("vs Eagles");
    expect(out).not.toContain(P1);
  });

  it("handles legacy availability rows without game context", () => {
    expect(describeActivity("availability_set", `${P1}: Not Available`, refs())).toBe(
      "marked Jordan Reyes as Not Available"
    );
  });

  it("describes lineup placement and clearing with slot labels", () => {
    const put = describeActivity("lineup_set", JSON.stringify({ gameId: G1, slotKey: "LA1", playerId: P1 }), refs());
    expect(put).toContain("put Jordan Reyes at Low Attack 1");
    const cleared = describeActivity("lineup_set", JSON.stringify({ gameId: G1, slotKey: "SF2", playerId: null }), refs());
    expect(cleared).toContain("cleared Field 2");
    expect(describeActivity("lineup_set", "7M1: empty", refs())).toBe("cleared Middie 1");
    expect(describeActivity("lineup_set", `SF1: ${P1}`, refs())).toBe("put Jordan Reyes at Field 1");
  });

  it("falls back gracefully for removed players and games", () => {
    const d = JSON.stringify({ playerId: "33333333-3333-4333-8333-333333333333", gameId: "44444444-4444-4444-8444-444444444444", status: "Maybe" });
    expect(describeActivity("availability_set", d, refs())).toBe(
      "marked a removed player as Maybe for a game that has since been deleted"
    );
  });

  it("phrases No Response as a reset", () => {
    const d = JSON.stringify({ playerId: P1, gameId: G1, status: "No Response" });
    expect(describeActivity("availability_set", d, refs())).toContain("reset Jordan Reyes to No Response");
  });

  it("describes game create / update / delete, including legacy id-only deletes", () => {
    expect(describeActivity("game_created", "2026-10-03 vs Eagles", refs())).toContain("scheduled a game on");
    expect(describeActivity("game_updated", "2026-10-03", refs())).toContain("updated the game on");
    expect(describeActivity("game_deleted", "2026-10-03 vs Eagles", refs())).toContain("deleted the game on");
    expect(describeActivity("game_deleted", G1, refs())).toBe("deleted a game");
    expect(describeActivity("game_deleted", "", refs())).toBe("deleted a game");
  });

  it("describes game results, friendlies and cleared scores", () => {
    const set = describeActivity("game_result_set", JSON.stringify({ gameId: G1, ourScore: 12, opponentScore: 8, isFriendly: false }), refs());
    expect(set).toContain("recorded a final score of 12-8 for the game on");
    expect(set).toContain("vs Eagles");
    const friendly = describeActivity("game_result_set", JSON.stringify({ gameId: G1, ourScore: 3, opponentScore: 3, isFriendly: true }), refs());
    expect(friendly).toContain("(friendly)");
    const cleared = describeActivity("game_result_set", JSON.stringify({ gameId: G1, ourScore: null, opponentScore: null, isFriendly: false }), refs());
    expect(cleared).toContain("cleared the final score");
  });

  it("describes tournaments and availability imports", () => {
    expect(describeActivity("tournament_created", "Spring Classic", refs())).toBe("created the tournament Spring Classic");
    expect(describeActivity("tournament_deleted", "Spring Classic", refs())).toBe("deleted the tournament Spring Classic");
    const G2 = "55555555-5555-4555-8555-555555555555";
    const r = refs();
    r.games.set(G2, { date: "2026-10-04", opponent: null });
    const out = describeActivity("availability_imported", JSON.stringify({ gameId: G2, sourceGameId: G1, count: 1 }), r);
    expect(out).toContain("imported availability from the game on");
    expect(out).toContain("vs Eagles");
    expect(out).toContain("(1 player)");
    expect(collectActivityRefs([{ action: "availability_imported", details: JSON.stringify({ gameId: G2, sourceGameId: G1, count: 1 }) }]).gameIds.size).toBe(2);
  });

  it("describes adding and removing guests", () => {
    const r = refs();
    const details = JSON.stringify({ playerId: P1, gameId: G1 });
    expect(describeActivity("guest_added", details, r)).toContain("added Jordan Reyes as a guest for the game on");
    expect(describeActivity("guest_removed", details, r)).toContain("removed guest Jordan Reyes for the game on");
    expect(describeActivity("guest_added", null, r)).toBe("added a player as a guest");
    const ids = collectActivityRefs([{ action: "guest_added", details }]);
    expect(ids.playerIds.has(P1)).toBe(true);
    expect(ids.gameIds.has(G1)).toBe(true);
  });

  it("describes a guest added straight to the guest roster", () => {
    expect(describeActivity("guest_created", "Gia Guest", refs())).toBe("added Gia Guest to the guest roster");
    expect(describeActivity("guest_created", null, refs())).toBe("added a guest to the guest roster");
  });

  it("resolves coach and player ids to names", () => {
    expect(describeActivity("coach_assigned", U1, refs())).toBe("added Sam Coach to the team");
    expect(describeActivity("coach_removed", "user_gone", refs())).toBe("removed a coach from the team");
    expect(describeActivity("player_archived", P1, refs())).toBe("archived Jordan Reyes");
    expect(describeActivity("player_restored", "Sam Smith", refs())).toBe("restored Sam Smith");
  });

  it("describes a team gender change and boys lineup slots", () => {
    expect(describeActivity("team_gender_changed", "boys", refs())).toBe("changed the team to Boys");
    expect(describeActivity("team_gender_changed", "girls", refs())).toBe("changed the team to Girls");
    expect(describeActivity("club_gender_changed", "boys", refs())).toBe("changed the club to Boys");
    expect(describeActivity("game_subs_changed", "on 2026-10-03 vs Eagles", refs())).toMatch(/^turned subs on for the game on .* vs Eagles$/);
    expect(describeActivity("game_subs_changed", "off", refs())).toBe("turned subs off for a game");
    const put = describeActivity("lineup_set", JSON.stringify({ gameId: G1, slotKey: "BA3", playerId: P1 }), refs());
    expect(put).toContain("put Jordan Reyes at Attack 3");
  });

  it("maps theme and team type keys to labels", () => {
    expect(describeActivity("team_theme_changed", "navy", refs())).toBe("changed the team color to Navy");
    expect(describeActivity("team_type_changed", "rec", refs())).toBe("changed the team type to Rec");
  });

  it("never throws on unknown actions or malformed details", () => {
    expect(describeActivity("something_new", "x", refs())).toBe("something new (x)");
    expect(describeActivity("availability_set", "{bad json", refs())).toBe("updated availability");
    expect(describeActivity("lineup_set", null, refs())).toBe("updated the lineup");
  });
});

describe("collectActivityRefs", () => {
  it("gathers ids from new and legacy formats", () => {
    const ids = collectActivityRefs([
      { action: "availability_set", details: JSON.stringify({ playerId: P1, gameId: G1, status: "Available" }) },
      { action: "lineup_set", details: `SF1: ${P1}` },
      { action: "player_archived", details: P1 },
      { action: "coach_assigned", details: U1 },
      { action: "lineup_set", details: "SF1: empty" },
    ]);
    expect([...ids.playerIds]).toEqual([P1]);
    expect([...ids.gameIds]).toEqual([G1]);
    const r = collectActivityRefs([{ action: "game_result_set", details: JSON.stringify({ gameId: G1, ourScore: 1, opponentScore: 0 }) }]);
    expect([...r.gameIds]).toEqual([G1]);
    expect([...ids.userIds]).toEqual([U1]);
  });
});
