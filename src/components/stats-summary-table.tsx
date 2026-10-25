"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatStat, perGame } from "@/lib/stat-rollup";
import { cn } from "@/lib/utils";

type Category = { id: string; label: string };
type Row = { playerId: string; name: string; number: string | null; games: number; totals: Record<string, number> };

/** The team roll-up: a row per player, a column per stat category. Click a header to sort, a name for their games. */
export function StatsSummaryTable({
  teamId,
  categories,
  rows,
  seasonQuery,
}: {
  teamId: string;
  categories: Category[];
  rows: Row[];
  seasonQuery: string; // "" or "?season=..." so the player page keeps the filter
}) {
  const [mode, setMode] = useState<"total" | "avg">("total");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  const value = (r: Row, key: string) => {
    if (key === "name") return 0;
    if (key === "games") return r.games;
    const t = r.totals[key] ?? 0;
    return mode === "avg" ? perGame(t, r.games) : t;
  };

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const cmp = sort.key === "name" ? a.name.localeCompare(b.name) : value(a, sort.key) - value(b, sort.key);
      if (cmp === 0) return a.name.localeCompare(b.name); // ties stay alphabetical
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, mode]);

  const teamTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const c of categories) totals[c.id] = rows.reduce((sum, r) => sum + (r.totals[c.id] ?? 0), 0);
    return totals;
  }, [rows, categories]);

  function header(key: string, label: string, align: "left" | "center") {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn(align === "left" ? "text-left" : "text-center", key === "name" && "sticky left-0 z-10 bg-white")}
      >
        <button
          type="button"
          onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }))}
          className={cn("w-full px-3 py-2 text-xs font-medium uppercase hover:text-brand-blue", align === "left" ? "text-left" : "text-center", active ? "text-brand-orange" : "text-slate-500")}
        >
          {label}
          {active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
        </button>
      </th>
    );
  }

  const show = (r: Row, key: string) => {
    const n = value(r, key);
    return mode === "avg" ? formatStat(n, 1) : formatStat(n);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Show totals or per game averages">
          {(
            [
              ["total", "Totals"],
              ["avg", "Per game"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium",
                mode === key ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">Click a column to sort. Click a player to see their game-by-game stats.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              {header("name", "Player", "left")}
              {header("games", "Games", "center")}
              {categories.map((c) => header(c.id, c.label, "center"))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => (
              <tr key={r.playerId} className={cn(r.games === 0 && "text-slate-400")}>
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium">
                  <Link href={`/teams/${teamId}/stats/player/${r.playerId}${seasonQuery}`} className="text-brand-blue hover:underline">
                    {r.number ? <span className="mr-1 text-slate-400">#{r.number}</span> : null}
                    {r.name}
                  </Link>
                </th>
                <td className="px-3 py-2 text-center">{r.games}</td>
                {categories.map((c) => (
                  <td key={c.id} className="px-3 py-2 text-center tabular-nums">
                    {show(r, c.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {mode === "total" && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">
                  Team total
                </th>
                <td className="px-3 py-2" />
                {categories.map((c) => (
                  <td key={c.id} className="px-3 py-2 text-center tabular-nums">
                    {formatStat(teamTotals[c.id] ?? 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-slate-500">&ldquo;Games&rdquo; counts games where the player has at least one stat entered. Per-game averages use that number.</p>
    </div>
  );
}
