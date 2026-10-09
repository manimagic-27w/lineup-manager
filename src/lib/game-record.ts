/**
 * Win / loss / tie math for the games list. Pure so it's easy to test.
 *
 * A game counts toward the record only when it has a final score AND isn't a friendly.
 * Games with no score yet (upcoming, or just not entered) and friendlies are skipped.
 */

export type ScoredGame = {
  ourScore: number | null;
  opponentScore: number | null;
  isFriendly: boolean;
};

export type GameOutcome = "W" | "L" | "T";

/** The result of one game, or null if no final score has been recorded. */
export function gameOutcome(game: Pick<ScoredGame, "ourScore" | "opponentScore">): GameOutcome | null {
  if (game.ourScore == null || game.opponentScore == null) return null;
  if (game.ourScore > game.opponentScore) return "W";
  if (game.ourScore < game.opponentScore) return "L";
  return "T";
}

export function computeRecord(games: ScoredGame[]) {
  const record = { wins: 0, losses: 0, ties: 0, friendlies: 0 };
  for (const g of games) {
    const outcome = gameOutcome(g);
    if (!outcome) continue;
    if (g.isFriendly) {
      record.friendlies += 1;
      continue;
    }
    if (outcome === "W") record.wins += 1;
    else if (outcome === "L") record.losses += 1;
    else record.ties += 1;
  }
  return record;
}

/** "5-2" or, when there are ties, "5-2-1". */
export function formatRecord(r: { wins: number; losses: number; ties: number }) {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}
