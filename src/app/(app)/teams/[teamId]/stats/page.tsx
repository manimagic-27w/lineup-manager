import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { getStatSheet, upgradeStatCategories } from "@/actions/stats";
import { requireTeamAccess } from "@/lib/auth";
import { StatsEnable } from "@/components/stats-enable";
import { SeasonPills } from "@/components/season-pills";
import { StatsSummaryTable } from "@/components/stats-summary-table";
import { TeamRealtime } from "@/components/team-realtime";
import { filterGamesBySeason, rollupPlayer } from "@/lib/stat-rollup";

export default async function StatsSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { teamId } = await params;
  const { season = "all" } = await searchParams;
  await requireTeamAccess(teamId);
  await upgradeStatCategories(teamId);
  const sheet = await getStatSheet(teamId);
  if (sheet.categories.length === 0) return <StatsEnable teamId={teamId} />;

  const teamSeasons = await db.select({ id: seasons.id, name: seasons.name }).from(seasons).where(eq(seasons.teamId, teamId)).orderBy(asc(seasons.createdAt));
  const games = filterGamesBySeason(sheet.games, season);
  const categoryIds = sheet.categories.map((c) => c.id);
  const rows = sheet.roster.map((p) => {
    const r = rollupPlayer(p.id, games, categoryIds, sheet.values, sheet.availability);
    return { playerId: p.id, name: p.name, number: p.number, games: r.games, totals: r.totals };
  });

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["stats", "availability"]} />
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Team stats</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every player&apos;s totals across {games.length} game{games.length === 1 ? "" : "s"}. To add or change numbers, use{" "}
          <Link href={`/teams/${teamId}/stats/sheet`} className="font-medium text-brand-blue hover:underline">
            Enter &amp; import stats
          </Link>
          .
        </p>
      </div>
      <SeasonPills
        basePath={`/teams/${teamId}/stats`}
        seasons={teamSeasons}
        current={season}
        hasUnassigned={sheet.games.some((g) => !g.seasonId)}
      />
      {games.length === 0 || rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {rows.length === 0 ? "Add players to your roster to see their stats here." : "No games in this view yet."}
        </p>
      ) : (
        <StatsSummaryTable
          teamId={teamId}
          categories={sheet.categories.map((c) => ({ id: c.id, label: c.label }))}
          rows={rows}
          seasonQuery={season === "all" ? "" : `?season=${season}`}
        />
      )}
    </div>
  );
}
