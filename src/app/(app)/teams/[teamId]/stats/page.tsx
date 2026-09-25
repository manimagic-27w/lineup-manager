import { getStatSheet, addStatCategory, removeStatCategory } from "@/actions/stats";
import { enableStatsForTeam } from "@/actions/teams";
import { requireTeamAccess } from "@/lib/auth";
import { StatsTable } from "@/components/stats-table";
import { SubmitButton } from "@/components/submit-button";
import { TeamRealtime } from "@/components/team-realtime";

export default async function StatsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamAccess(teamId);
  const sheet = await getStatSheet(teamId);

  if (sheet.categories.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-semibold text-slate-900">Track stats for this team</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Turn on a stats sheet with the basics - Goals, Assists, Ground Balls, Saves, and
          Forced Turnovers - one column per game, automatically blacked out for players who
          were unavailable. You can add your own categories afterward.
        </p>
        <form action={enableStatsForTeam} className="mt-6 inline-block">
          <input type="hidden" name="teamId" value={teamId} />
          <SubmitButton pendingLabel="Enabling…">Enable stats tracking</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["stats", "availability"]} />

      <StatsTable
        teamId={teamId}
        categories={sheet.categories}
        games={sheet.games}
        roster={sheet.roster}
        values={sheet.values}
        blackouts={sheet.blackouts}
        canEdit
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Categories</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {sheet.categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
              {c.label}
              <form action={removeStatCategory}>
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="categoryId" value={c.id} />
                <button type="submit" className="text-slate-400 hover:text-red-600" aria-label={`Remove ${c.label}`}>
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addStatCategory} className="flex items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">New category</label>
            <input
              name="label"
              required
              placeholder="e.g. Faceoff Wins"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
