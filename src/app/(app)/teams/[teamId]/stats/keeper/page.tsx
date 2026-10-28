import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { statCategories } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { upgradeStatCategories } from "@/actions/stats";
import { StatsEnable } from "@/components/stats-enable";
import { StatKeeperSetup } from "@/components/stat-keeper-setup";
import { KEEPER_ACTIONS } from "@/lib/stat-keeper";

export default async function StatKeeperSetupPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { team } = await requireTeamAccess(teamId);
  await upgradeStatCategories(teamId);
  const categories = await db.select({ id: statCategories.id }).from(statCategories).where(eq(statCategories.teamId, teamId)).limit(1);
  if (categories.length === 0) return <StatsEnable teamId={teamId} />;

  const url = team.statKeeperToken ? `${getAppUrl()}/keep/${team.statKeeperToken}` : null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Stat keeper</h2>
        <p className="mt-1 text-sm text-slate-600">
          A quick screen for keeping stats during a game, with no sign-in. The keeper opens your link, types the PIN, picks the game, then for each play:
          choose the player, choose the action, tap Commit. Stats update on the Team summary and Game logs as they go.
        </p>
      </div>

      <StatKeeperSetup teamId={teamId} url={url} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <h3 className="text-sm font-semibold text-slate-900">What each tap records</h3>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {KEEPER_ACTIONS.map((a) => (
            <li key={a.key}>
              <strong className="text-slate-900">{a.label}</strong>
              {a.key === "goal" ? " counts as a goal and a shot" : ""}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Players marked Not Available for the game aren&apos;t shown. Every tap also appears in the game&apos;s log, and the keeper can undo plays they made on the screen.
          Anyone with the link and PIN can add stats, so share them only with your keeper.
        </p>
      </section>
    </div>
  );
}
