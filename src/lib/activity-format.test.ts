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

  it("resolves coach and player ids to names", () => {
    expect(describeActivity("coach_assigned", U1, refs())).toBe("added Sam Coach to the team");
    expect(describeActivity("coach_removed", "user_gone", refs())).toBe("removed a coach from the team");
    expect(describeActivity("player_archived", P1, refs())).toBe("archived Jordan Reyes");
    expect(describeActivity("player_restored", "Sam Smith", refs())).toBe("restored Sam Smith");
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
