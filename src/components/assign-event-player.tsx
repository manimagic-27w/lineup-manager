"use client";

import { useState, useTransition } from "react";
import { assignEventPlayer } from "@/actions/stat-keeper";

/** On a game log: fill in the player for a play the stat keeper saved without one (an unknown
 *  assist, shown as #100). The play then counts in that player's stats. */
export function AssignEventPlayer({
  teamId,
  eventId,
  roster,
}: {
  teamId: string;
  eventId: string;
  roster: { id: string; name: string; number: string | null }[];
}) {
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    setError("");
    startTransition(async () => {
      const res = await assignEventPlayer(teamId, eventId, playerId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value)}
        aria-label="Player for this play"
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        <option value="">Choose player…</option>
        {roster.map((p) => (
          <option key={p.id} value={p.id}>
            {p.number ? `#${p.number} ` : ""}
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={!playerId || pending}
        className="rounded-md bg-brand-orange px-3 py-1 text-sm font-medium text-white hover:bg-brand-orange-light disabled:opacity-60"
      >
        {pending ? "Saving…" : "Assign"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
