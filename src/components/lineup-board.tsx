"use client";

import { useTransition } from "react";
import { setLineupSlot } from "@/actions/games";
import { cn } from "@/lib/utils";

type Slot = { key: string; label: string; unit: string; pos: string; playerId: string | null };
type RosterPlayer = { id: string; name: string; status: string };

const UNIT_ORDER = ["Attack", "Midfield", "Defense", "Goalie"];

export function LineupBoard({
  teamId,
  gameId,
  slots,
  roster,
  canEdit,
}: {
  teamId: string;
  gameId: string;
  slots: Slot[];
  roster: RosterPlayer[];
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();

  const playerName = (id: string | null) => roster.find((p) => p.id === id)?.name ?? "";
  const assignedElsewhere = new Set(slots.map((s) => s.playerId).filter(Boolean) as string[]);

  function assign(slotKey: string, playerId: string) {
    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("gameId", gameId);
    fd.set("slotKey", slotKey);
    if (playerId) fd.set("playerId", playerId);
    startTransition(() => {
      setLineupSlot(fd);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {UNIT_ORDER.map((unit) => (
        <div key={unit} className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{unit}</h3>
          <ul className="space-y-2">
            {slots
              .filter((s) => s.unit === unit)
              .map((slot) => {
                const eligible = roster.filter(
                  (p) =>
                    p.status !== "Not Available" &&
                    (p.id === slot.playerId || !assignedElsewhere.has(p.id))
                );
                return (
                  <li key={slot.key} className="flex items-center justify-between gap-2">
                    <span className="w-28 shrink-0 text-sm text-slate-600">{slot.label}</span>
                    {canEdit ? (
                      <select
                        value={slot.playerId ?? ""}
                        onChange={(e) => assign(slot.key, e.target.value)}
                        className={cn(
                          "flex-1 rounded-md border px-2 py-1 text-sm",
                          slot.playerId ? "border-slate-300 bg-white" : "border-dashed border-slate-300 text-slate-400"
                        )}
                      >
                        <option value="">Empty</option>
                        {eligible.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="flex-1 text-sm text-slate-900">{playerName(slot.playerId) || "Empty"}</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
