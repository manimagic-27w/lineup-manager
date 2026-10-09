import { listGames, createGame } from "@/actions/games";
import { listSeasons, createSeason, deleteSeason } from "@/actions/seasons";
import { requireTeamAccess } from "@/lib/auth";
import { GamesList } from "@/components/games-list";
import { SubmitButton } from "@/components/submit-button";
import { TeamRealtime } from "@/components/team-realtime";

export default async function GamesPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamAccess(teamId);
  const [games, seasons] = await Promise.all([listGames(teamId), listSeasons(teamId)]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["games"]} />

      <GamesList teamId={teamId} games={games} seasons={seasons} />

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
          {seasons.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Season</label>
              <select name="seasonId" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">No season</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Format</label>
            <select name="format" defaultValue="field" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="field">Field (12 starters)</option>
              <option value="sevens">Sevens (8 a side)</option>
              <option value="sixes">Sixes (6 a side)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Notes</label>
            <input name="notes" className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" name="isFriendly" className="h-4 w-4" />
            Friendly
          </label>
          <SubmitButton pendingLabel="Scheduling…">Add game</SubmitButton>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Seasons</h2>
        <p className="mb-3 text-xs text-slate-500">
          Group games under a season (e.g. &ldquo;Fall 2026&rdquo;) so you can filter the schedule above.
          Deleting a season never deletes its games - they just fall back to &ldquo;No season.&rdquo;
        </p>
        {seasons.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {seasons.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
                {s.name}
                <form action={deleteSeason}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="seasonId" value={s.id} />
                  <button type="submit" className="text-slate-400 hover:text-red-600" aria-label={`Delete ${s.name}`}>
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={createSeason} className="flex items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">New season</label>
            <input
              name="name"
              required
              placeholder="e.g. Fall 2026"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add season
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
