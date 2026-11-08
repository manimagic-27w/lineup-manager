import { ensureHttpUrl } from "./utils";

export type FilmIndexGame = {
  id: string;
  date: string;
  opponent: string | null;
  href: string;
  /** e.g. "W 8-5", or null when no score has been entered. */
  result: string | null;
  friendly: boolean;
};
export type FilmIndexTournament = { name: string | null; games: FilmIndexGame[] };
export type FilmIndexSeason = { name: string | null; tournaments: FilmIndexTournament[] };

type Row = {
  id: string;
  date: string;
  opponent: string | null;
  filmUrl: string | null;
  ourScore: number | null;
  opponentScore: number | null;
  isFriendly: boolean;
  seasonId: string | null;
  tournamentId: string | null;
};

export function resultText(our: number | null, theirs: number | null): string | null {
  if (our == null || theirs == null) return null;
  const letter = our > theirs ? "W" : our < theirs ? "L" : "T";
  return `${letter} ${our}-${theirs}`;
}

/**
 * Only games with a video link, grouped by season, then by tournament within each season. Seasons
 * are ordered by their newest game, "No season" last; within a group the newest game is first,
 * and a game with no tournament sits ahead of that season's tournament groups.
 */
export function buildFilmIndex(rows: Row[], seasonNames: Map<string, string>, tournamentNames: Map<string, string>): FilmIndexSeason[] {
  const withFilm = rows.filter((g) => g.filmUrl && g.filmUrl.trim()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const seasons = new Map<string, { name: string | null; newest: string; tournaments: Map<string, FilmIndexTournament> }>();
  for (const g of withFilm) {
    const seasonKey = g.seasonId && seasonNames.has(g.seasonId) ? g.seasonId : "none";
    let season = seasons.get(seasonKey);
    if (!season) {
      season = { name: seasonKey === "none" ? null : (seasonNames.get(seasonKey) ?? null), newest: g.date, tournaments: new Map() };
      seasons.set(seasonKey, season);
    }
    const tKey = g.tournamentId && tournamentNames.has(g.tournamentId) ? g.tournamentId : "none";
    let tournament = season.tournaments.get(tKey);
    if (!tournament) {
      tournament = { name: tKey === "none" ? null : (tournamentNames.get(tKey) ?? null), games: [] };
      season.tournaments.set(tKey, tournament);
    }
    tournament.games.push({
      id: g.id,
      date: g.date,
      opponent: g.opponent,
      href: ensureHttpUrl(g.filmUrl!.trim()),
      result: resultText(g.ourScore, g.opponentScore),
      friendly: g.isFriendly,
    });
  }
  return [...seasons.values()]
    .sort((a, b) => {
      if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
      return a.newest < b.newest ? 1 : a.newest > b.newest ? -1 : 0;
    })
    .map((s) => ({
      name: s.name,
      // The no-tournament group first, then tournaments (each already newest-first).
      tournaments: [...s.tournaments.values()].sort((a, b) => (a.name === null ? -1 : 0) - (b.name === null ? -1 : 0)),
    }));
}
