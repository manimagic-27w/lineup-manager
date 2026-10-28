import { describe, expect, it } from "vitest";
import { DEFAULT_STAT_CATEGORIES } from "@/lib/db/schema";
import { KEEPER_ACTIONS, KEEPER_STAT_KEYS, keeperActionByKey, keeperActionByKind, tallyEvents } from "./stat-keeper";

describe("keeper actions", () => {
  it("has unique keys and kinds", () => {
    expect(new Set(KEEPER_ACTIONS.map((a) => a.key)).size).toBe(KEEPER_ACTIONS.length);
    expect(new Set(KEEPER_ACTIONS.map((a) => a.kind)).size).toBe(KEEPER_ACTIONS.length);
  });

  it("only writes stat keys that exist as default categories, and covers all of them", () => {
    const defaults = new Set<string>(DEFAULT_STAT_CATEGORIES.map((c) => c.key));
    for (const k of KEEPER_STAT_KEYS) expect(defaults.has(k)).toBe(true);
    for (const d of defaults) expect(KEEPER_STAT_KEYS).toContain(d);
  });

  it("counts a goal as a goal and a shot", () => {
    expect(keeperActionByKey("goal")?.stats).toEqual(["goals", "shots"]);
    expect(keeperActionByKey("shot")?.stats).toEqual(["shots"]);
  });

  it("looks actions up by kind and rejects unknown ones", () => {
    expect(keeperActionByKind("goalie_save")?.stats).toEqual(["saves"]);
    expect(keeperActionByKey("nope")).toBeNull();
    expect(keeperActionByKind("shot_wide")).toBeNull();
  });
});

describe("tallyEvents", () => {
  it("counts our goals and goals allowed", () => {
    expect(tallyEvents([{ kind: "goal" }, { kind: "goal" }, { kind: "assist" }, { kind: "goal_allowed" }])).toEqual({ goals: 2, allowed: 1 });
    expect(tallyEvents([])).toEqual({ goals: 0, allowed: 0 });
  });
});
