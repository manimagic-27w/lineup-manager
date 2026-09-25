import { listRoster } from "@/actions/players";
import { addPlayer, importRosterCsv } from "@/actions/players";
import { requireTeamAccess } from "@/lib/auth";
import { RosterTable } from "@/components/roster-table";
import { SubmitButton } from "@/components/submit-button";
import { TeamRealtime } from "@/components/team-realtime";
import { POSITIONS } from "@/lib/db/schema";

export default async function RosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireTeamAccess(teamId);
  const players = await listRoster(teamId, { includeArchived: true });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} scopes={["roster"]} />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <RosterTable players={players} canEdit />
      </div>

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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Grade</label>
            <input name="grade" className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Experience</label>
            <input name="experience" className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <SubmitButton pendingLabel="Adding…">Add player</SubmitButton>
        </form>
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
