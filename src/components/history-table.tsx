"use client";

import { Fragment, useState } from "react";
import type { PlayerStartHistory } from "@/actions/history";
import { POSITIONS } from "@/lib/db/schema";
import { cn, formatDate } from "@/lib/utils";

export function HistoryTable({ players }: { players: PlayerStartHistory[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(playerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  if (players.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No players yet - add some on the roster page.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Player</th>
            {POSITIONS.map((pos) => (
              <th key={pos} className="px-4 py-2 text-center">
                {pos}
              </th>
            ))}
            <th className="px-4 py-2 text-center">Total starts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {players.map((p) => {
            const isOpen = expanded.has(p.playerId);
            return (
              <Fragment key={p.playerId}>
                <tr
                  onClick={() => toggle(p.playerId)}
                  className={cn(
                    "cursor-pointer hover:bg-slate-50",
                    p.archived ? "text-slate-400" : ""
                  )}
                >
                  <td className="px-4 py-2 font-medium">
                    <span className="mr-2 inline-block w-3 text-slate-400">{isOpen ? "▾" : "▸"}</span>
                    {p.name}
                    {p.number ? ` #${p.number}` : ""}
                  </td>
                  {POSITIONS.map((pos) => (
                    <td key={pos} className="px-4 py-2 text-center">
                      {p.countsByPosition[pos] > 0 ? p.countsByPosition[pos] : "-"}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-center font-medium">{p.totalStarts}</td>
                </tr>
                {isOpen && (
                  <tr key={`${p.playerId}-detail`} className="bg-slate-50">
                    <td colSpan={POSITIONS.length + 2} className="px-4 py-3">
                      {p.starts.length === 0 ? (
                        <p className="text-xs text-slate-500">No starts recorded yet.</p>
                      ) : (
                        <ul className="space-y-1 text-xs text-slate-600">
                          {p.starts.map((s) => (
                            <li key={s.gameId} className="flex items-center gap-2">
                              <span className="w-40 shrink-0 text-slate-900">{formatDate(s.date)}</span>
                              <span className="w-32 shrink-0">{s.opponent ?? "-"}</span>
                              <span className="font-medium text-brand-blue">{s.position}</span>
                              <span className="text-slate-400">({s.slotLabel})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
