import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { getStatSheet, upgradeStatCategories } from "@/actions/stats";
import { requireTeamAccess } from "@/lib/auth";
import { StatsEnable } from "@/components/stats-enable";
import { SeasonPills } from "@/components/season-pills";
import { TeamRealtime } from "@/components/team-realtime";
import { filterGamesBySeason, formatStat, perGame, rollupPlayer } from "@/lib/stat-rollup";
import { cn, formatDate } from "@/lib/utils";

export default async function PlayerStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; playerId: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { teamId, playerId } = await params;
  const { season = "all" } = await searchParams;
  await requireTeamAccess(teamId);
  await upgradeStatCategories(teamId);
  const sheet = await getStatSheet(teamId);
  if (sheet.categories.length === 0) return <StatsEnable teamId={teamId} />;
  const player = sheet.roster.find((p) => p.id === playerId);
  if (!player) notFound();

  const teamSeasons = await db.select({ id: seasons.id, name: seasons.name }).from(seasons).where(eq(seasons.teamId, teamId)).orderBy(asc(seasons.createdAt));
  const games = filterGamesBySeason(sheet.games, season);
  const categoryIds = sheet.categories.map((c) => c.id);
  const roll = rollupPlayer(playerId, games, categoryIds, sheet.values);
  const back = `/teams/${teamId}/stats${season === "all" ? "" : `?season=${season}`}`;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["stats", "availability"]} />
      <div>
        <Link href={back} className="text-sm font-medium text-brand-blue hover:underline">
          &larr; Team stats
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {player.number ? <span className="mr-1 text-slate-400">#{player.number}</span> : null}
          {player.name}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Game-by-game stats. {roll.games} game{roll.games === 1 ? "" : "s"} with stats entered.
        </p>
      </div>
      <SeasonPills
        basePath={`/teams/${teamId}/stats/player/${playerId}`}
        seasons={teamSeasons}
        current={season}
        hasUnassigned={sheet.games.some((g) => !g.seasonId)}
      />

      {games.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No games in this view yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
                  Game
                </th>
                {sheet.categories.map((c) => (
                  <th key={c.id} scope="col" className="px-3 py-2 text-center text-xs font-medium uppercase text-slate-500">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...games].reverse().map((g) => {
                const out = sheet.blackouts[`${g.id}:${playerId}`];
                return (
                  <tr key={g.id} className={cn(out && "bg-slate-50 text-slate-400")}>
                    <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2 text-left font-medium", out ? "bg-slate-50 text-slate-500" : "bg-white text-slate-900")}>
                      <div>{formatDate(g.date)}</div>
                      <div className="text-xs font-normal text-slate-500">
                        {g.opponent ? `vs ${g.opponent}` : "Game"}
                        {g.ourScore !== null && g.opponentScore !== null ? ` · ${g.ourScore}-${g.opponentScore}` : ""}
                        {out ? " · not available" : ""}
                      </div>
                    </th>
                    {sheet.categories.map((c) => {
                      const raw = sheet.values[`${g.id}:${playerId}:${c.id}`];
                      return (
                        <td key={c.id} className="px-3 py-2 text-center tabular-nums">
                          {raw === undefined ? <span className="text-slate-300">–</span> : formatStat(Number(raw))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr className="font-semibold">
                <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">
                  Total
                </th>
                {sheet.categories.map((c) => (
                  <td key={c.id} className="px-3 py-2 text-center tabular-nums">
                    {formatStat(roll.totals[c.id] ?? 0)}
                  </td>
                ))}
              </tr>
              <tr className="text-slate-600">
                <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium">
                  Per game
                </th>
                {sheet.categories.map((c) => (
                  <td key={c.id} className="px-3 py-2 text-center tabular-nums">
                    {formatStat(perGame(roll.totals[c.id] ?? 0, roll.games), 1)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
