import Link from "next/link";
import { listGames, createGame } from "@/actions/games";
import { requireTeamAccess } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { TeamRealtime } from "@/components/team-realtime";
import { formatDate } from "@/lib/utils";

export default async function GamesPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamAccess(teamId);
  const games = await listGames(teamId);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["games"]} />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {games.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No games scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {games.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/teams/${teamId}/games/${g.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">{formatDate(g.date)}</div>
                    {g.opponent && <div className="text-sm text-slate-500">vs {g.opponent}</div>}
                  </div>
                  <span className="text-sm text-slate-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Schedule a game</h2>
        <form action={createGame} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              name="date"
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Opponent</label>
            <input name="opponent" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Notes</label>
            <input name="notes" className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <SubmitButton pendingLabel="Scheduling…">Add game</SubmitButton>
        </form>
      </section>
    </div>
  );
}
