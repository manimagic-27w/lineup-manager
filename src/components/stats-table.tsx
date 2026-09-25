"use client";

import { useTransition } from "react";
import { setStatValue } from "@/actions/stats";
import { formatDate, cn } from "@/lib/utils";

type Category = { id: string; label: string };
type Game = { id: string; date: string; opponent: string | null };
type Player = { id: string; name: string };

export function StatsTable({
  teamId,
  categories,
  games,
  roster,
  values,
  blackouts,
  canEdit,
}: {
  teamId: string;
  categories: Category[];
  games: Game[];
  roster: Player[];
  values: Record<string, string>;
  blackouts: Record<string, boolean>;
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();

  function update(gameId: string, playerId: string, categoryId: string, value: string) {
    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("gameId", gameId);
    fd.set("playerId", playerId);
    fd.set("categoryId", categoryId);
    fd.set("value", value);
    startTransition(() => {
      setStatValue(fd);
    });
  }

  if (games.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Schedule a game to start tracking stats.</p>;
  }
  if (roster.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Add players to your roster to track stats.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
              Player
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Stat</th>
            {games.map((g) => (
              <th key={g.id} className="px-3 py-2 text-center text-xs font-medium text-slate-500">
                {formatDate(g.date)}
                {g.opponent && <div className="font-normal text-slate-400">vs {g.opponent}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.map((player, pIdx) =>
            categories.map((cat, cIdx) => (
              <tr
                key={`${player.id}:${cat.id}`}
                className={cn(cIdx === 0 && pIdx > 0 && "border-t-2 border-slate-200")}
              >
                {cIdx === 0 ? (
                  <td
                    className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-slate-900"
                    rowSpan={categories.length}
                  >
                    {player.name}
                  </td>
                ) : null}
                <td className="px-3 py-1.5 text-slate-600">{cat.label}</td>
                {games.map((g) => {
                  const blackout = blackouts[`${g.id}:${player.id}`];
                  const value = values[`${g.id}:${player.id}:${cat.id}`] ?? "";
                  return (
                    <td key={g.id} className="px-2 py-1 text-center">
                      {blackout ? (
                        <span className="block h-7 rounded bg-slate-200" title="Not available for this game" />
                      ) : canEdit ? (
                        <input
                          type="number"
                          defaultValue={value}
                          onBlur={(e) => update(g.id, player.id, cat.id, e.target.value)}
                          className="h-7 w-14 rounded border border-slate-200 text-center text-sm"
                        />
                      ) : (
                        <span>{value || "-"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
