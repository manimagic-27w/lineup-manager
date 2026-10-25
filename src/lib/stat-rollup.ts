// Pure helpers for the team stats summary and the per-player game-by-game page. `values` is the
// sheet's map of "gameId:playerId:categoryId" -> numeric string.

export type RollupGame = { id: string; seasonId: string | null };

/** "all" (or missing) keeps every game, "none" keeps games with no season, otherwise a season id. */
export function filterGamesBySeason<G extends RollupGame>(games: G[], season: string | undefined): G[] {
  if (!season || season === "all") return games;
  if (season === "none") return games.filter((g) => !g.seasonId);
  return games.filter((g) => g.seasonId === season);
}

function num(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type PlayerRollup = {
  playerId: string;
  /** Games in the filtered set where this player has at least one stat entered. */
  games: number;
  totals: Record<string, number>; // categoryId -> total
};

export function rollupPlayer(
  playerId: string,
  games: { id: string }[],
  categoryIds: string[],
  values: Record<string, string>,
): PlayerRollup {
  const totals: Record<string, number> = Object.fromEntries(categoryIds.map((c) => [c, 0]));
  let played = 0;
  for (const g of games) {
    let any = false;
    for (const c of categoryIds) {
      const n = num(values[`${g.id}:${playerId}:${c}`]);
      if (n === null) continue;
      any = true;
      totals[c] += n;
    }
    if (any) played++;
  }
  return { playerId, games: played, totals };
}

/** 2 -> "2", 2.5 -> "2.5", 2.333 -> "2.33" */
export function formatStat(n: number, decimals = 2): string {
  return String(Number(n.toFixed(decimals)));
}

export function perGame(total: number, games: number): number {
  return games > 0 ? total / games : 0;
}
