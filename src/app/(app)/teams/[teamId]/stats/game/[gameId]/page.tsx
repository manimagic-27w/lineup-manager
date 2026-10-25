import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gameEvents } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { getGameForTeam } from "@/lib/game-events";
import { formatClock, summarizePeriods } from "@/lib/stat-import";
import { TeamRealtime } from "@/components/team-realtime";
import { cn, formatDate } from "@/lib/utils";

export default async function GameLogPage({ params }: { params: Promise<{ teamId: string; gameId: string }> }) {
  const { teamId, gameId } = await params;
  await requireTeamAccess(teamId);
  const game = await getGameForTeam(teamId, gameId);
  if (!game) notFound();
  const events = await db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId)).orderBy(asc(gameEvents.seq));
  const periods = summarizePeriods(events);
  const goalsFor = periods.reduce((n, p) => n + p.goalsFor, 0);
  const goalsAgainst = periods.reduce((n, p) => n + p.goalsAgainst, 0);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-6 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["stats"]} />
      <div>
        <Link href={`/teams/${teamId}/stats/games`} className="text-sm font-medium text-brand-blue hover:underline">
          &larr; Game logs
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {formatDate(game.date)}
          {game.opponent ? ` vs ${game.opponent}` : ""}
        </h2>
        {game.ourScore !== null && game.opponentScore !== null && <p className="text-sm text-slate-600">Final: {game.ourScore}-{game.opponentScore}</p>}
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No play-by-play has been imported for this game.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Goals by period</th>
                  <th className="px-3 py-2 text-center font-medium">Scored</th>
                  <th className="px-3 py-2 text-center font-medium">Allowed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map((p) => (
                  <tr key={p.period}>
                    <td className="px-3 py-2 font-medium text-slate-900">{p.label}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{p.goalsFor}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{p.goalsAgainst}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-center tabular-nums">{goalsFor}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{goalsAgainst}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {periods.map((p) => (
            <section key={p.period}>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{p.label}</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {events
                  .filter((e) => e.period === p.period)
                  .map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-16 shrink-0 tabular-nums text-slate-500" title={e.paused ? "Logged while the clock was stopped" : undefined}>
                        {formatClock(e.remainingSec)}
                        {e.paused ? " ⏸" : ""}
                      </span>
                      <span
                        className={cn(
                          "w-36 shrink-0 font-medium",
                          e.kind === "goal" && "text-green-700",
                          e.kind === "goal_allowed" && "text-red-600",
                          e.kind !== "goal" && e.kind !== "goal_allowed" && "text-slate-800",
                        )}
                      >
                        {e.label}
                      </span>
                      {e.playerId ? (
                        <Link href={`/teams/${teamId}/stats/player/${e.playerId}`} className="text-brand-blue hover:underline">
                          {e.playerName}
                        </Link>
                      ) : (
                        <span className="text-slate-600">{e.playerName}</span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-slate-500">Times are approximate (time remaining in the period). ⏸ means the clock was stopped when it was logged.</p>
        </>
      )}
    </div>
  );
}
