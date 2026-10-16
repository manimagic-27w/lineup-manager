"use client";

import { useState, useTransition } from "react";
import { importAvailability } from "@/actions/games";

type Option = { id: string; label: string; group: string };

/**
 * "Copy availability from another game" - for a tournament weekend where a coach collects
 * availability once. Only fills in players still at "No Response" (enforced by the server
 * action), so it never overwrites an answer already entered on this game.
 */
export function ImportAvailability({
  teamId,
  gameId,
  options,
}: {
  teamId: string;
  gameId: string;
  options: Option[];
}) {
  const [source, setSource] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (options.length === 0) return null;

  // <optgroup> per group label, in the order the options arrive (same tournament first).
  const groups = [...new Set(options.map((o) => o.group))];

  function run() {
    if (!source) return;
    setMessage(null);
    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("gameId", gameId);
    fd.set("sourceGameId", source);
    startTransition(async () => {
      try {
        const { imported } = await importAvailability(fd);
        setMessage({
          kind: "ok",
          text:
            imported === 0
              ? "Nothing to import - everyone with an answer there already has one here."
              : `Imported availability for ${imported} player${imported === 1 ? "" : "s"}.`,
        });
      } catch {
        setMessage({ kind: "error", text: "Couldn't import. Please try again." });
      }
    });
  }

  return (
    <div className="space-y-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
      <label htmlFor="import-source" className="block text-xs font-medium text-slate-600">
        Copy availability from another game
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="import-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Choose a game…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => o.group === g)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={!source || pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
      <p className="text-xs text-slate-500">Only fills in players still at No Response. Answers you&rsquo;ve already entered stay as they are.</p>
      {message && (
        <p role="status" className={message.kind === "ok" ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
