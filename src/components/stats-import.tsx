"use client";

import { useMemo, useState, useTransition } from "react";
import { importGameStats } from "@/actions/stats";
import Link from "next/link";
import { crossCheck, matchPlayer, normName, parseStatText, statLabel, withGoalieStats, type RosterPlayer } from "@/lib/stat-import";
import { cn, formatDate } from "@/lib/utils";

type Game = { id: string; date: string; opponent: string | null };

function defaultGame(games: Game[]) {
  const today = new Date().toISOString().slice(0, 10);
  const played = games.filter((g) => g.date <= today);
  return (played.length > 0 ? played[played.length - 1] : games[games.length - 1])?.id ?? "";
}

/** "Import game stats": paste a box score, pick the game, check who matched, import. */
export function StatsImport({ teamId, games, roster }: { teamId: string; games: Game[]; roster: RosterPlayer[] }) {
  const [open, setOpen] = useState(false);
  const [gameId, setGameId] = useState(() => defaultGame(games));
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Record<number, string>>({}); // line -> playerId, "" = skip
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [logLink, setLogLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(() => parseStatText(text), [text]);
  // Saves and Goals Allowed only exist in the play-by-play, so they are filled in from it.
  const lines = useMemo(() => withGoalieStats(parsed.rows, parsed.events), [parsed]);
  const warnings = useMemo(() => crossCheck(parsed.rows, parsed.events, parsed.score), [parsed]);
  const rows = useMemo(
    () =>
      lines.map((r) => {
        const auto = matchPlayer(r, roster);
        const playerId = r.line in overrides ? overrides[r.line] : (auto?.playerId ?? "");
        return { ...r, auto, playerId };
      }),
    [lines, overrides, roster],
  );

  const toImport = rows.filter((r) => r.playerId);
  const unmatched = rows.filter((r) => !r.playerId).length;

  function run() {
    if (!gameId) return setResult({ kind: "error", text: "Pick the game these stats are for." });
    // Two lines for the same player are added together.
    const merged = new Map<string, Record<string, number>>();
    for (const r of toImport) {
      const acc = merged.get(r.playerId) ?? {};
      for (const [k, v] of Object.entries(r.stats)) acc[k] = (acc[k] ?? 0) + v;
      merged.set(r.playerId, acc);
    }
    setResult(null);
    startTransition(async () => {
      try {
        // Each play is tied to the roster player its name was matched to (following any change made above).
        const byName = new Map(rows.filter((r) => r.playerId).map((r) => [normName(r.name), r.playerId]));
        const events = parsed.events.map((e) => ({
          seq: e.seq,
          period: e.period,
          periodLabel: e.periodLabel,
          remainingSec: e.remainingSec,
          elapsedSec: e.elapsedSec,
          paused: e.paused,
          kind: e.kind,
          label: e.label,
          playerId: byName.get(normName(e.name)) ?? matchPlayer({ name: e.name, number: null }, roster)?.playerId ?? null,
          playerName: e.name,
        }));
        const res = await importGameStats({ teamId, gameId, rows: [...merged].map(([playerId, stats]) => ({ playerId, stats })), events });
        if (!res.ok) return setResult({ kind: "error", text: res.error });
        const extras = [
          res.categoriesAdded.length > 0 ? `Added: ${res.categoriesAdded.join(", ")}.` : "",
          res.skippedUnavailable.length > 0 ? `Skipped (marked Not Available for this game): ${res.skippedUnavailable.join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join(" ");
        const log = res.events > 0 ? ` Saved ${res.events} plays to the game log.` : "";
        setResult({ kind: "ok", text: `Imported stats for ${res.imported} player${res.imported === 1 ? "" : "s"}.${log} ${extras}`.trim() });
        if (res.events > 0) setLogLink(`/teams/${teamId}/stats/game/${gameId}`);
        setText("");
        setOverrides({});
      } catch {
        setResult({ kind: "error", text: "Couldn't import - check your signal and try again." });
      }
    });
  }

  if (games.length === 0 || roster.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Import game stats</h2>
          <p className="text-xs text-slate-500">Paste a box score for one game instead of typing each number.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200"
        >
          {open ? "Close" : "Import"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="import-game" className="text-sm font-medium text-slate-700">
              Game
            </label>
            <select
              id="import-game"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {formatDate(g.date)}
                  {g.opponent ? ` - vs ${g.opponent}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="import-text" className="text-sm font-medium text-slate-700">
              Stats from your stat keeper
            </label>
            <textarea
              id="import-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setOverrides({});
                setResult(null);
                setLogLink(null);
              }}
              rows={6}
              placeholder="Paste the whole message from your stat keeper - box score and play-by-play."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            />
            <p className="mt-1 text-xs text-slate-500">
              Codes: G Goals, A Assists, SH Shots, GB Ground Balls, DC Draw Controls, CT Caused Turnovers, TO Turnovers, SV Saves, GA Goals Allowed.
              Numbers you import replace what&apos;s already entered for those stats in that game.
            </p>
          </div>

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">From your text</th>
                    <th className="px-3 py-2">Roster player</th>
                    <th className="px-3 py-2">Stats</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const nonzero = Object.entries(r.stats).filter(([, v]) => v > 0);
                    return (
                      <tr key={r.line} className={cn(!r.playerId && "bg-amber-50")}>
                        <td className="px-3 py-1.5 text-slate-700">
                          {r.number ? `#${r.number} ` : ""}
                          {r.name}
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            aria-label={`Roster player for ${r.name}`}
                            value={r.playerId}
                            onChange={(e) => setOverrides((o) => ({ ...o, [r.line]: e.target.value }))}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                          >
                            <option value="">Skip this line</option>
                            {roster.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.number ? `#${p.number} ` : ""}
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {r.auto && !(r.line in overrides) && r.auto.by === "number" && <span className="ml-2 text-xs text-slate-400">matched by number</span>}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">
                          {nonzero.length === 0 ? <span className="text-slate-400">all zeros</span> : nonzero.map(([k, v]) => `${statLabel(k)} ${v}`).join(", ")}
                          {r.unknownCodes.length > 0 && <span className="ml-2 text-xs text-red-600">Unknown: {r.unknownCodes.join(", ")}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {parsed.events.length > 0 && (
            <p className="text-xs text-slate-600">
              Found {parsed.events.length} plays in the play-by-play. They&apos;ll be saved as this game&apos;s log, and Saves and Goals Allowed are counted from them.
            </p>
          )}
          {warnings.length > 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">The box score and play-by-play don&apos;t fully agree:</p>
              <ul className="mt-1 list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {parsed.unparsed.length > 0 && (
            <p className="text-xs text-amber-700">
              {parsed.unparsed.length} line{parsed.unparsed.length === 1 ? "" : "s"} couldn&apos;t be read and will be ignored: {parsed.unparsed.map((u) => u.text).join(" | ")}
            </p>
          )}
          {unmatched > 0 && <p className="text-xs text-amber-700">{unmatched} line{unmatched === 1 ? "" : "s"} not matched to a roster player - pick one above or they&apos;ll be skipped.</p>}

          {result && (
            <p className={cn("text-sm", result.kind === "ok" ? "text-green-700" : "text-red-600")} role="status">
              {result.text}
              {result.kind === "ok" && logLink && (
                <>
                  {" "}
                  <Link href={logLink} className="font-medium underline">
                    View the game log
                  </Link>
                </>
              )}
            </p>
          )}

          <button
            type="button"
            onClick={run}
            disabled={pending || toImport.length === 0}
            className="rounded-md bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:bg-brand-orange-light disabled:opacity-50"
          >
            {pending ? "Importing…" : toImport.length === 0 ? "Import" : `Import ${toImport.length} player${toImport.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </section>
  );
}
