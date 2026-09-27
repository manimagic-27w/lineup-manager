import { getStartHistory } from "@/actions/history";
import { requireTeamAccess } from "@/lib/auth";
import { HistoryTable } from "@/components/history-table";
import { TeamRealtime } from "@/components/team-realtime";

export default async function HistoryPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamAccess(teamId);
  const history = await getStartHistory(teamId);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["lineup", "games", "roster"]} />

      <div>
        <h1 className="text-xl font-semibold text-slate-900">Start history</h1>
        <p className="mt-1 text-sm text-slate-600">
          How many games each player has started at each position, based on the lineup saved for
          every game. Click a player to see the game-by-game breakdown.
        </p>
      </div>

      <HistoryTable players={history} />
    </div>
  );
}
