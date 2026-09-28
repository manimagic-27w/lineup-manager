"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ensureHttpUrl, formatDate } from "@/lib/utils";

type Game = {
  id: string;
  date: string;
  opponent: string | null;
  seasonId: string | null;
  filmUrl: string | null;
};
type Season = { id: string; name: string };

const NO_SEASON = "__none__";

export function GamesList({ teamId, games, seasons }: { teamId: string; games: Game[]; seasons: Season[] }) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter) return games;
    if (filter === NO_SEASON) return games.filter((g) => !g.seasonId);
    return games.filter((g) => g.seasonId === filter);
  }, [games, filter]);

  return (
    <div className="space-y-3">
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

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {games.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No games scheduled yet.</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No games in this season.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/teams/${teamId}/games/${g.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{formatDate(g.date)}</div>
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
                          Film ↗
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-slate-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
