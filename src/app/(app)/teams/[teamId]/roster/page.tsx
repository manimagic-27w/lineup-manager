import { listRoster } from "@/actions/players";
import { addPlayer, importRosterCsv } from "@/actions/players";
import { requireTeamAccess } from "@/lib/auth";
import { RosterTable } from "@/components/roster-table";
import { SubmitButton } from "@/components/submit-button";
import { TeamRealtime } from "@/components/team-realtime";
import { EXPERIENCE_LEVELS_BY_TEAM_TYPE, POSITIONS, TeamType } from "@/lib/db/schema";

export default async function RosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { team } = await requireTeamAccess(teamId);
  const players = await listRoster(teamId, { includeArchived: true });
  const guests = await listRoster(teamId, { includeArchived: true, guests: "only" });
  const experienceLevels =
    EXPERIENCE_LEVELS_BY_TEAM_TYPE[team.teamType as TeamType] ?? EXPERIENCE_LEVELS_BY_TEAM_TYPE.travel;
  // Travel teams don't track grade (it's a rec-league thing), so it's hidden for them.
  const hideGrade = team.teamType === "travel";

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["roster"]} />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <RosterTable players={players} canEdit experienceLevels={experienceLevels} hideGrade={hideGrade} />
      </div>

      {guests.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-900">Guest roster</h2>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">
            Guests aren&rsquo;t part of your core roster and only appear on games you add them to
            (use <strong>+ Add guest</strong> on a game). Archive a guest to hide them from the
            Add guest list; their History is kept.
          </p>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <RosterTable players={guests} canEdit experienceLevels={experienceLevels} hideGrade={hideGrade} />
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a player</h2>
        <form action={addPlayer} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Name</label>
            <input name="name" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">#</label>
            <input name="number" className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Position</label>
            <select name="position" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">-</option>
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>
          {!hideGrade && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Grade</label>
              <input name="grade" className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Experience</label>
            <select name="experience" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">-</option>
              {experienceLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="player-type" className="text-xs font-medium text-slate-600">
              Type
            </label>
            <select
              id="player-type"
              name="playerType"
              defaultValue="core"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="core">Core roster</option>
              <option value="guest">Guest</option>
            </select>
          </div>
          <SubmitButton pendingLabel="Adding…">Add player</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Core players are on every game. Guests go on your guest roster and only appear on games you add
          them to.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Import from CSV</h2>
        <p className="mb-3 text-xs text-slate-500">
          Paste rows with a header of <code>name,number,position,grade,experience</code> (only
          name is required).
        </p>
        <form action={importRosterCsv} className="space-y-3">
          <input type="hidden" name="teamId" value={teamId} />
          <textarea
            name="csv"
            required
            rows={6}
            placeholder={"name,number,position,grade,experience\nJordan Reyes,7,Attack,11,3 years"}
            className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
          />
          <SubmitButton pendingLabel="Importing…">Import players</SubmitButton>
        </form>
      </section>
    </div>
  );
}
