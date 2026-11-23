"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ensureHttpUrl, formatDate } from "@/lib/utils";
import { computeRecord, formatRecord, gameOutcome } from "@/lib/game-record";
import { groupGamesByTournament } from "@/lib/tournament-groups";
import { CollapsibleGroup } from "@/components/collapsible-group";

type Game = {
  id: string;
  date: string;
  opponent: string | null;
  seasonId: string | null;
  filmUrl: string | null;
  filmUrl2?: string | null;
  format: string;
  ourScore: number | null;
  opponentScore: number | null;
  isFriendly: boolean;
  tournamentId: string | null;
};
type Season = { id: string; name: string };

const NO_SEASON = "__none__";

const OUTCOME_STYLES = {
  W: "bg-green-100 text-green-800",
  L: "bg-red-100 text-red-800",
  T: "bg-slate-200 text-slate-700",
} as const;

export function GamesList({
  teamId,
  games,
  seasons,
  tournaments = [],
}: {
  teamId: string;
  games: Game[];
  seasons: Season[];
  tournaments?: { id: string; name: string }[];
}) {
  const [filter, setFilter] = useState("");
  // Tournaments start collapsed; "Other games" starts open. Keys here are the ones the coach has flipped.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const flip = (key: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filtered = useMemo(() => {
    if (!filter) return games;
    if (filter === NO_SEASON) return games.filter((g) => !g.seasonId);
    return games.filter((g) => g.seasonId === filter);
  }, [games, filter]);

  // Follows the season filter, so picking "Fall 2026" shows that season's record.
  const record = useMemo(() => computeRecord(filtered), [filtered]);
  const groups = useMemo(() => groupGamesByTournament(filtered, tournaments), [filtered, tournaments]);
  const hasResults = record.wins + record.losses + record.ties + record.friendlies > 0;


  function renderGame(g: Game) {
    return (
      <li key={g.id}>
        <Link
          href={`/teams/${teamId}/games/${g.id}`}
          className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{formatDate(g.date)}</span>
              {g.isFriendly && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Friendly
                </span>
              )}
              {g.format !== "field" && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                  {g.format === "sixes" ? "Sixes" : "Sevens"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              {g.opponent && <span>vs {g.opponent}</span>}
              {g.filmUrl && (
                <a
                  href={ensureHttpUrl(g.filmUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-blue hover:underline"
                >
                  {g.filmUrl2 ? "Film 1 ↗" : "Film ↗"}
                </a>
              )}
              {g.filmUrl2 && (
                <a
                  href={ensureHttpUrl(g.filmUrl2)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-blue hover:underline"
                >
                  {g.filmUrl ? "Film 2 ↗" : "Film ↗"}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(() => {
              const outcome = gameOutcome(g);
              return outcome ? (
                <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-slate-900">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${OUTCOME_STYLES[outcome]}`}>
                    {outcome}
                  </span>
                  {g.ourScore}&ndash;{g.opponentScore}
                </span>
              ) : null;
            })()}
            <span className="text-sm text-slate-400">→</span>
          </div>
        </Link>
      </li>
    );
  }

  return (
    <div className="space-y-3">
      {hasResults && (
        <div className="flex flex-wrap items-baseline gap-x-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <span className="text-xs font-medium uppercase text-slate-500">Record</span>
          <span className="text-xl font-bold tabular-nums text-slate-900">{formatRecord(record)}</span>
          {record.friendlies > 0 && (
            <span className="text-xs text-slate-500">
              {record.friendlies} friendl{record.friendlies === 1 ? "y" : "ies"} not counted
            </span>
          )}
        </div>
      )}
      {seasons.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="season-filter" className="text-xs font-medium text-slate-600">
            Season
          </label>
          <select
            id="season-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">All seasons</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={NO_SEASON}>No season</option>
          </select>
        </div>
      )}

      {games.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <p className="p-4 text-sm text-slate-500">No games scheduled yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <p className="p-4 text-sm text-slate-500">No games in this season.</p>
        </div>
      ) : (
        groups.map((group) => {
          // No tournaments: the plain schedule, exactly as before.
          if (tournaments.length === 0) {
            return (
              <div key="__ungrouped__" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <ul className="divide-y divide-slate-100">{group.games.map((g) => renderGame(g))}</ul>
              </div>
            );
          }
          const key = group.tournament?.id ?? "__ungrouped__";
          const startsOpen = !group.tournament;
          return (
            <CollapsibleGroup
              key={key}
              title={group.tournament ? group.tournament.name : groups.length > 1 ? "Other games" : "Games"}
              count={group.games.length}
              countLabel="game"
              open={flipped.has(key) !== startsOpen}
              onToggle={() => flip(key)}
              flush
            >
              <ul className="divide-y divide-slate-100">{group.games.map((g) => renderGame(g))}</ul>
            </CollapsibleGroup>
          );
        })
      )}
    </div>
  );
}
