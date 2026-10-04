import { SEVENS_SLOTS, SIXES_SLOTS, SLOTS, TEAM_TYPES } from "@/lib/db/schema";
import { THEMES, formatDate } from "@/lib/utils";

/**
 * Turns a raw activity_log row (action + details text) into a plain-English sentence fragment
 * like "put Jordan Reyes at Low Attack 1 for the game on Sat, Oct 3, 2026 vs Eagles".
 *
 * Pure on purpose: the server action gathers the names (players, games, Clerk users) in batched
 * queries and hands them in, so this file has no DB or Clerk dependency and is easy to test.
 *
 * Details come in three vintages:
 *   - JSON objects (newest) for the actions that reference rows by id (availability_set,
 *     lineup_set), carrying the game id so we can say which game it was.
 *   - Readable text (game_*, player_*, team_* ...) written directly by the action.
 *   - Legacy raw ids ("<uuid>: Available", "SF1: <uuid>", a bare uuid). Still resolved to
 *     names where we can; the missing game context is simply left off.
 */

export type ActivityRefs = {
  players: Map<string, string>;
  games: Map<string, { date: string; opponent: string | null }>;
  users: Map<string, string>;
};

export type ActivityRefIds = {
  playerIds: Set<string>;
  gameIds: Set<string>;
  userIds: Set<string>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLOT_LABELS = new Map<string, string>(
  [...SLOTS, ...SIXES_SLOTS, ...SEVENS_SLOTS].map((s) => [s.key, s.label])
);

type Entry = { action: string; details: string | null };

function parseJson(details: string | null): Record<string, unknown> | null {
  if (!details || !details.startsWith("{")) return null;
  try {
    const v = JSON.parse(details);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Legacy availability details: "<playerId>: <status>". */
function parseLegacyAvailability(details: string | null) {
  const i = details?.indexOf(": ") ?? -1;
  if (!details || i < 0) return null;
  return { playerId: details.slice(0, i), status: details.slice(i + 2) };
}

/** Legacy lineup details: "<slotKey>: <playerId | empty>". */
function parseLegacyLineup(details: string | null) {
  const i = details?.indexOf(": ") ?? -1;
  if (!details || i < 0) return null;
  const rest = details.slice(i + 2);
  return { slotKey: details.slice(0, i), playerId: rest === "empty" ? null : rest };
}

function availabilityParts(details: string | null) {
  const j = parseJson(details);
  if (j) {
    return {
      playerId: typeof j.playerId === "string" ? j.playerId : null,
      gameId: typeof j.gameId === "string" ? j.gameId : null,
      status: typeof j.status === "string" ? j.status : "",
    };
  }
  const legacy = parseLegacyAvailability(details);
  return legacy ? { ...legacy, gameId: null } : null;
}

function lineupParts(details: string | null) {
  const j = parseJson(details);
  if (j) {
    return {
      slotKey: typeof j.slotKey === "string" ? j.slotKey : "",
      playerId: typeof j.playerId === "string" ? j.playerId : null,
      gameId: typeof j.gameId === "string" ? j.gameId : null,
    };
  }
  const legacy = parseLegacyLineup(details);
  return legacy ? { ...legacy, gameId: null } : null;
}

/** Which ids a page of entries needs resolved, so the caller can fetch them in one query each. */
export function collectActivityRefs(entries: Entry[]): ActivityRefIds {
  const ids: ActivityRefIds = { playerIds: new Set(), gameIds: new Set(), userIds: new Set() };
  for (const { action, details } of entries) {
    if (action === "availability_set") {
      const p = availabilityParts(details);
      if (p?.playerId && UUID_RE.test(p.playerId)) ids.playerIds.add(p.playerId);
      if (p?.gameId && UUID_RE.test(p.gameId)) ids.gameIds.add(p.gameId);
    } else if (action === "lineup_set") {
      const p = lineupParts(details);
      if (p?.playerId && UUID_RE.test(p.playerId)) ids.playerIds.add(p.playerId);
      if (p?.gameId && UUID_RE.test(p.gameId)) ids.gameIds.add(p.gameId);
    } else if (action === "player_archived" || action === "player_restored") {
      if (details && UUID_RE.test(details)) ids.playerIds.add(details);
    } else if (action === "coach_assigned" || action === "coach_removed") {
      if (details) ids.userIds.add(details);
    }
  }
  return ids;
}

/** "Sat, Oct 3, 2026 vs Eagles" from stored "2026-10-03 vs Eagles" or a bare date. */
function gameLabelFromText(text: string) {
  const m = /^(\d{4}-\d{2}-\d{2})(?: vs (.+))?$/.exec(text);
  if (!m) return text;
  return `${formatDate(m[1])}${m[2] ? ` vs ${m[2]}` : ""}`;
}

function gameLabelFromRef(game: { date: string; opponent: string | null }) {
  return `${formatDate(game.date)}${game.opponent ? ` vs ${game.opponent}` : ""}`;
}

function forGame(gameId: string | null, refs: ActivityRefs) {
  if (!gameId) return "";
  const g = refs.games.get(gameId);
  return g ? ` for the game on ${gameLabelFromRef(g)}` : " for a game that has since been deleted";
}

function playerName(id: string | null, refs: ActivityRefs) {
  if (!id) return "a player";
  return refs.players.get(id) ?? "a removed player";
}

export function describeActivity(action: string, details: string | null, refs: ActivityRefs): string {
  const d = details?.trim() || "";

  switch (action) {
    case "availability_set": {
      const p = availabilityParts(details);
      if (!p) return "updated availability";
      const who = playerName(p.playerId, refs);
      const where = forGame(p.gameId, refs);
      if (p.status === "No Response") return `reset ${who} to No Response${where}`;
      return `marked ${who} as ${p.status || "updated"}${where}`;
    }
    case "lineup_set": {
      const p = lineupParts(details);
      if (!p) return "updated the lineup";
      const slot = SLOT_LABELS.get(p.slotKey) ?? p.slotKey;
      const where = forGame(p.gameId, refs);
      if (!p.playerId) return `cleared ${slot}${where}`;
      return `put ${playerName(p.playerId, refs)} at ${slot}${where}`;
    }
    case "game_created":
      return d ? `scheduled a game on ${gameLabelFromText(d)}` : "scheduled a game";
    case "game_updated":
      return d ? `updated the game on ${gameLabelFromText(d)}` : "updated a game";
    case "game_deleted":
      // Older rows stored the raw game id (the game itself is gone, so it can't be looked up).
      return d && !UUID_RE.test(d) ? `deleted the game on ${gameLabelFromText(d)}` : "deleted a game";
    case "coach_assigned":
      return `added ${d ? (refs.users.get(d) ?? "a coach") : "a coach"} to the team`;
    case "coach_removed":
      return `removed ${d ? (refs.users.get(d) ?? "a coach") : "a coach"} from the team`;
    case "player_archived":
    case "player_restored": {
      const verb = action === "player_archived" ? "archived" : "restored";
      if (!d) return `${verb} a player`;
      return `${verb} ${UUID_RE.test(d) ? (refs.players.get(d) ?? "a removed player") : d}`;
    }
    case "player_added":
      return d ? `added ${d} to the roster` : "added a player";
    case "player_updated":
      return d ? `updated ${d}` : "updated a player";
    case "player_deleted":
      return d ? `deleted ${d} from the roster` : "deleted a player";
    case "roster_imported":
      return d ? `imported the roster (${d})` : "imported the roster";
    case "roster_updated":
      return d ? `updated positions and experience for ${d}` : "updated the roster";
    case "team_created":
      return d ? `created the team ${d}` : "created the team";
    case "team_renamed":
      return d ? `renamed the team to ${d}` : "renamed the team";
    case "team_theme_changed": {
      const label = THEMES.find((t) => t.key === d)?.label;
      return label ? `changed the team color to ${label}` : "changed the team color";
    }
    case "team_type_changed": {
      const label = TEAM_TYPES.find((t) => t.key === d)?.label;
      return label ? `changed the team type to ${label}` : "changed the team type";
    }
    case "stats_enabled":
      return "turned on stats tracking";
    case "stat_category_added":
      return d ? `added the stat category ${d}` : "added a stat category";
    case "stat_category_removed":
      return d ? `removed the stat category ${d}` : "removed a stat category";
    case "season_created":
      return d ? `created the season ${d}` : "created a season";
    case "season_deleted":
      return d ? `deleted the season ${d}` : "deleted a season";
    case "data_exported":
      return d ? `exported team data (${d})` : "exported team data";
    default:
      return d ? `${action.replace(/_/g, " ")} (${d})` : action.replace(/_/g, " ");
  }
}
