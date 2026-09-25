import Link from "next/link";
import { requireTeamAccess } from "@/lib/auth";
import { renameTeam, setTeamTheme } from "@/actions/teams";
import { listTeamCoaches, assignCoachToTeam, removeCoachFromTeam, listOrgMembers } from "@/actions/coaches";
import { SubmitButton } from "@/components/submit-button";
import { THEMES } from "@/lib/utils";

export default async function TeamSettingsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { team, isAdmin } = await requireTeamAccess(teamId);
  const coaches = await listTeamCoaches(teamId);
  const orgMembers = isAdmin ? await listOrgMembers() : [];
  const assignable = orgMembers.filter((m) => !coaches.some((c) => c.userId === m.userId));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Team name</h2>
        <form action={renameTeam} className="flex items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <input
            name="name"
            defaultValue={team.name}
            required
            disabled={!isAdmin}
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50"
          />
          {isAdmin && (
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save
            </SubmitButton>
          )}
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Theme</h2>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <form key={t.key} action={setTeamTheme}>
              <input type="hidden" name="teamId" value={teamId} />
              <input type="hidden" name="theme" value={t.key} />
              <button
                type="submit"
                className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:border-slate-400"
                style={{ backgroundColor: team.theme === t.key ? "#f1f5f9" : undefined }}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.swatch }} />
                {t.label}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Coaches</h2>
        <ul className="mb-3 divide-y divide-slate-100">
          {coaches.length === 0 && <li className="py-2 text-sm text-slate-500">No coaches assigned yet.</li>}
          {coaches.map((c) => (
            <li key={c.userId} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium text-slate-900">{c.name}</div>
                <div className="text-slate-500">{c.email}</div>
              </div>
              {isAdmin && (
                <form action={removeCoachFromTeam}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="userId" value={c.userId} />
                  <button type="submit" className="text-xs font-medium text-slate-500 hover:text-red-600">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {isAdmin && (
          <form action={assignCoachToTeam} className="flex items-end gap-3">
            <input type="hidden" name="teamId" value={teamId} />
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Add a club member as coach</label>
              <select name="userId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Select a member…</option>
                {assignable.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton variant="secondary" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Need to invite someone new to the club first? Head to{" "}
          <Link href="/admin" className="underline">
            club admin
          </Link>
          .
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Export data</h2>
        <p className="mb-3 text-xs text-slate-500">
          Download this team&rsquo;s data - the Excel workbook includes roster, games,
          availability, lineups, and stats as separate sheets.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/teams/${teamId}/export?format=csv`}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200"
          >
            Download roster (.csv)
          </a>
          <a
            href={`/api/teams/${teamId}/export?format=xlsx`}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Download full export (.xlsx)
          </a>
        </div>
      </section>
    </div>
  );
}
