"use client";

import { useTransition } from "react";
import { setLineupSlot } from "@/actions/games";
import { cn } from "@/lib/utils";

type Slot = { key: string; label: string; unit: string; pos: string; playerId: string | null };
type RosterPlayer = { id: string; name: string; status: string; position: string | null };

const UNIT_ORDER = ["Attack", "Midfield", "Defense", "Goalie"];
const POSITION_LABEL: Record<string, string> = { Attack: "Attack", Mid: "Midfield", Def: "Defense", Goalie: "Goalie" };

// After a slot's own position group, the rest of the eligible players are grouped and ordered
// by this list (e.g. an Attack slot lists Midfield players before Defense, then Goalie).
// A Goalie slot has no fallback at all - only goalies are ever offered for it.
const FALLBACK_ORDER: Record<string, string[]> = {
  Attack: ["Mid", "Def", "Goalie"],
  Mid: ["Attack", "Def", "Goalie"],
  Def: ["Mid", "Attack", "Goalie"],
  Goalie: [],
};

function optionLabel(p: RosterPlayer) {
  let label = p.name;
  if (p.position) label += `-${p.position[0]}`;
  if (p.status === "Maybe") label += " (Maybe)";
  if (p.status === "Not Available") label += " (Not Available)";
  if (p.status === "No Response") label += " (No Response)";
  return label;
}

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

  const playerById = new Map(roster.map((p) => [p.id, p]));
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
                const assignedPlayer = slot.playerId ? playerById.get(slot.playerId) : undefined;
                const isMaybeStarter = assignedPlayer?.status === "Maybe";
                const isFlaggedStarter =
                  assignedPlayer?.status === "Not Available" || assignedPlayer?.status === "No Response";
                const isGoalieSlot = slot.pos === "Goalie";
                const fallbackOrder = FALLBACK_ORDER[slot.pos] ?? [];

                // Only players who are Available or Maybe show up as choices (Not Available /
                // No Response are hidden), except whoever is already assigned to this slot -
                // they always stay visible here even if their status changed after being
                // assigned, so the coach can still see/reassign them.
                const eligible = roster.filter((p) => {
                  if (p.id === slot.playerId) return true;
                  if (assignedElsewhere.has(p.id)) return false;
                  return p.status === "Available" || p.status === "Maybe";
                });

                // Players whose roster position matches this slot's position ("on position")
                // come first, separated visually from the rest. A Goalie slot only ever offers
                // goalies at all - no fallback group - other than protecting a player already
                // assigned there from disappearing outright.
                const onPosition = eligible.filter((p) => p.position === slot.pos);
                const rest = isGoalieSlot
                  ? eligible.filter((p) => p.position !== slot.pos && p.id === slot.playerId)
                  : eligible
                      .filter((p) => p.position !== slot.pos)
                      .sort((a, b) => {
                        const rank = (pos: string | null) => {
                          const idx = fallbackOrder.indexOf(pos ?? "");
                          return idx === -1 ? fallbackOrder.length : idx;
                        };
                        return rank(a.position) - rank(b.position);
                      });

                return (
                  <li key={slot.key} className="flex items-center justify-between gap-2">
                    <span className="w-28 shrink-0 text-sm text-slate-600">{slot.label}</span>
                    {canEdit ? (
                      <select
                        value={slot.playerId ?? ""}
                        onChange={(e) => assign(slot.key, e.target.value)}
                        className={cn(
                          "flex-1 rounded-md border px-2 py-1 text-sm",
                          isFlaggedStarter
                            ? "border-red-400 bg-red-100 text-red-800"
                            : isMaybeStarter
                              ? "border-amber-400 bg-amber-100 text-amber-900"
                              : slot.playerId
                                ? "border-slate-300 bg-white"
                                : "border-dashed border-slate-300 text-slate-400"
                        )}
                      >
                        <option value="">Empty</option>
                        <optgroup label={POSITION_LABEL[slot.pos] ?? slot.pos}>
                          {onPosition.map((p) => (
                            <option key={p.id} value={p.id}>
                              {optionLabel(p)}
                            </option>
                          ))}
                        </optgroup>
                        {rest.length > 0 && (
                          <optgroup label="Other positions">
                            {rest.map((p) => (
                              <option key={p.id} value={p.id}>
                                {optionLabel(p)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    ) : (
                      <span
                        className={cn(
                          "flex-1 rounded-md px-2 py-1 text-sm",
                          isFlaggedStarter
                            ? "bg-red-100 text-red-800"
                            : isMaybeStarter
                              ? "bg-amber-100 text-amber-900"
                              : "text-slate-900"
                        )}
                      >
                        {assignedPlayer?.name ?? "Empty"}
                      </span>
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
