/** The actions on the live stat keeper screen. Each one is saved as a play-by-play event of `kind`
 *  and adds 1 to every stat category in `stats` (keys of DEFAULT_STAT_CATEGORIES) for the player.
 *  A goal also counts as a shot, matching the box score ("Shots include goals"). */
export type KeeperGroup = "offense" | "possession" | "defense" | "goalie";

export const KEEPER_ACTIONS = [
  { key: "goal", label: "Goal", kind: "goal", stats: ["goals", "shots"], group: "offense" },
  { key: "assist", label: "Assist", kind: "assist", stats: ["assists"], group: "offense" },
  { key: "shot", label: "Shot", kind: "shot", stats: ["shots"], group: "offense" },
  { key: "draw_control", label: "Draw Control", kind: "draw_control", stats: ["draw_controls"], group: "possession" },
  { key: "ground_ball", label: "Ground Ball", kind: "ground_ball", stats: ["gb"], group: "possession" },
  { key: "turnover", label: "Turnover", kind: "turnover", stats: ["turnovers"], group: "possession" },
  { key: "caused_turnover", label: "Caused Turnover", kind: "caused_turnover", stats: ["caused_turnovers"], group: "defense" },
  { key: "forced_turnover", label: "Forced Turnover", kind: "forced_turnover", stats: ["fto"], group: "defense" },
  { key: "goalie_save", label: "Save", kind: "goalie_save", stats: ["saves"], group: "goalie" },
  { key: "goal_allowed", label: "Goal Allowed", kind: "goal_allowed", stats: ["goals_allowed"], group: "goalie" },
] as const;

export type KeeperActionKey = (typeof KEEPER_ACTIONS)[number]["key"];
export const KEEPER_ACTION_KEYS = KEEPER_ACTIONS.map((a) => a.key) as [KeeperActionKey, ...KeeperActionKey[]];

export function keeperActionByKey(key: string) {
  return KEEPER_ACTIONS.find((a) => a.key === key) ?? null;
}

export function keeperActionByKind(kind: string) {
  return KEEPER_ACTIONS.find((a) => a.kind === kind) ?? null;
}

/** Every stat key the keeper can write (so the team's categories exist before the first tap). */
export const KEEPER_STAT_KEYS = [...new Set(KEEPER_ACTIONS.flatMap((a) => a.stats))];

/** Most plays one game's log may hold, so a stuck button can't fill the database. */
export const MAX_EVENTS_PER_GAME = 1500;

/** Our goals and the goals we allowed, from a game's events (what the live score line shows). */
export function tallyEvents(events: { kind: string }[]) {
  let goals = 0;
  let allowed = 0;
  for (const e of events) {
    if (e.kind === "goal") goals++;
    else if (e.kind === "goal_allowed") allowed++;
  }
  return { goals, allowed };
}
