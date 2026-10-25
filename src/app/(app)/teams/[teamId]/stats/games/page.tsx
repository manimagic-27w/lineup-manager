import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { countEventsByGame } from "@/lib/game-events";
import { formatDate } from "@/lib/utils";

export default async function GameLogsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamAccess(teamId);
  const [teamGames, counts] = await Promise.all([
    db.select().from(games).where(eq(games.teamId, teamId)).orderBy(desc(games.date)),
    countEventsByGame(teamId),
  ]);
  const logged = teamGames.filter((g) => counts.has(g.id));

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Game logs</h2>
        <p className="mt-1 text-sm text-slate-600">
          The play-by-play from imported box scores, with goals by half. Paste the full message from your stat keeper in{" "}
          <Link href={`/teams/${teamId}/stats/sheet`} className="font-medium text-brand-blue hover:underline">
            Enter &amp; import stats
          </Link>{" "}
          to add one.
        </p>
      </div>
      {logged.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No game logs yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {logged.map((g) => (
            <li key={g.id}>
              <Link href={`/teams/${teamId}/stats/game/${g.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{formatDate(g.date)}</p>
                  <p className="text-xs text-slate-500">{g.opponent ? `vs ${g.opponent}` : "Game"}</p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  {g.ourScore !== null && g.opponentScore !== null && <p className="font-semibold text-slate-900">{g.ourScore}-{g.opponentScore}</p>}
                  <p className="text-xs text-slate-500">{counts.get(g.id)} plays</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
