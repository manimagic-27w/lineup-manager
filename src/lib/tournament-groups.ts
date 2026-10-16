/**
 * Pure helpers for the tournament feature: grouping the schedule and ordering the
 * "import availability from..." choices. No DB or React, so they're easy to test.
 */

export type GroupableGame = { id: string; date: string; tournamentId: string | null };
export type TournamentRef = { id: string; name: string };

export type GameGroup<G extends GroupableGame> = {
  tournament: TournamentRef | null;
  games: G[];
};

/**
 * Splits games into one group per tournament (most recent tournament first) followed by a final
 * group for games with no tournament. Games keep the order they came in (the schedule is
 * newest-first already). A tournament with no games in `games` (e.g. filtered out by season) is
 * dropped. With no tournaments in play, returns a single ungrouped group so callers can render
 * the schedule exactly as before.
 */
export function groupGamesByTournament<G extends GroupableGame>(
  games: G[],
  tournaments: TournamentRef[]
): GameGroup<G>[] {
  const byId = new Map(tournaments.map((t) => [t.id, t]));
  const grouped = new Map<string, G[]>();
  const ungrouped: G[] = [];
  for (const g of games) {
    if (g.tournamentId && byId.has(g.tournamentId)) {
      grouped.set(g.tournamentId, [...(grouped.get(g.tournamentId) ?? []), g]);
    } else {
      ungrouped.push(g);
    }
  }
  const groups: GameGroup<G>[] = [...grouped.entries()]
    .map(([id, gs]) => ({ tournament: byId.get(id)!, games: gs }))
    .sort((a, b) => {
      const latest = (x: GameGroup<G>) => x.games.reduce((m, g) => (g.date > m ? g.date : m), "");
      return latest(b).localeCompare(latest(a));
    });
  if (ungrouped.length > 0) groups.push({ tournament: null, games: ungrouped });
  return groups;
}

/**
 * Orders the other games a coach can import availability from: games in the same tournament
 * first (closest date first), then everything else newest-first. The current game is excluded.
 */
export function orderImportSources<G extends GroupableGame>(games: G[], current: GroupableGame): G[] {
  const others = games.filter((g) => g.id !== current.id);
  const sameTournament = (g: G) => current.tournamentId != null && g.tournamentId === current.tournamentId;
  const distance = (g: G) => Math.abs(new Date(g.date).getTime() - new Date(current.date).getTime());
  const same = others.filter(sameTournament).sort((a, b) => distance(a) - distance(b));
  const rest = others.filter((g) => !sameTournament(g)).sort((a, b) => b.date.localeCompare(a.date));
  return [...same, ...rest];
}
