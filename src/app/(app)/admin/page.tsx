import Link from "next/link";
import { requireOrgAdmin } from "@/lib/auth";
import { listAccessibleTeams, createTeam } from "@/actions/teams";
import {
  inviteOrgMember,
  listOrgMembers,
  listPendingInvitations,
  revokeInvitation,
  removeOrgMember,
  updateMemberRole,
} from "@/actions/coaches";
import { SubmitButton } from "@/components/submit-button";
import { THEMES, themeSwatch } from "@/lib/utils";
import { TEAM_TYPES, TEAM_GENDERS } from "@/lib/db/schema";
import { setClubGender } from "@/actions/club";
import { getClubGender } from "@/lib/club";

export default async function AdminPage() {
  const session = await requireOrgAdmin();
  const [teams, members, invitations, clubGender] = await Promise.all([
    listAccessibleTeams(),
    listOrgMembers(),
    listPendingInvitations(),
    getClubGender(session.orgId),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Club admin</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage teams and who coaches them. Club membership is handled through Clerk; team
          assignment happens below and on each team&rsquo;s settings page.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Club</h2>
        <p className="mb-3 text-sm text-slate-600">
          A girls club starts 12 players on the field; a boys club starts 10 (3 attack, 3 midfield,
          3 defense and 1 goalie). It applies to every team in the club&rsquo;s regular (Field)
          games &ndash; Sixes and Sevens are the same for both. If you change it after lineups are
          built, those Field-game lineups won&rsquo;t carry over (they&rsquo;re kept, and reappear
          if you switch back).
        </p>
        <div className="flex flex-wrap gap-2">
          {TEAM_GENDERS.map((t) => (
            <form key={t.key} action={setClubGender}>
              <input type="hidden" name="gender" value={t.key} />
              <button
                type="submit"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:border-slate-400"
                style={{ backgroundColor: clubGender === t.key ? "#f1f5f9" : undefined }}
              >
                {t.label} club
              </button>
            </form>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Teams</h2>
        <ul className="mb-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {teams.length === 0 && (
            <li className="p-4 text-sm text-slate-500">No teams yet - create one below.</li>
          )}
          {teams.map((team) => (
            <li key={team.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: themeSwatch(team.theme) }}
                  aria-hidden
                />
                <span className="font-medium text-slate-900">{team.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {TEAM_TYPES.find((t) => t.key === team.teamType)?.label ?? "Travel"}
                </span>
              </div>
              <Link href={`/teams/${team.id}/settings`} className="text-sm text-slate-600 hover:text-brand-blue">
                Settings →
              </Link>
            </li>
          ))}
        </ul>

        <form action={createTeam} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-xs font-medium text-slate-600">
              Team name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="e.g. Bandits Green"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="theme" className="text-xs font-medium text-slate-600">
              Theme
            </label>
            <select id="theme" name="theme" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              {THEMES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="teamType" className="text-xs font-medium text-slate-600">
              Team type
            </label>
            <select id="teamType" name="teamType" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              {TEAM_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton pendingLabel="Creating…">Create team</SubmitButton>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Club members</h2>
        <ul className="mb-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {members.length === 0 && <li className="p-4 text-sm text-slate-500">No members yet.</li>}
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 p-4 text-sm">
              <div>
                <div className="font-medium text-slate-900">{m.name}</div>
                <div className="text-slate-500">{m.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {m.role === "org:admin" ? "Admin" : "Coach"}
                </span>
                {m.userId !== session.userId && (
                  <form action={updateMemberRole}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <input type="hidden" name="role" value={m.role === "org:admin" ? "org:member" : "org:admin"} />
                    <SubmitButton variant="secondary" pendingLabel="Updating…">
                      {m.role === "org:admin" ? "Remove admin" : "Make admin"}
                    </SubmitButton>
                  </form>
                )}
                {m.userId !== session.userId && (
                  <form action={removeOrgMember}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <SubmitButton variant="danger" pendingLabel="Removing…">
                      Remove
                    </SubmitButton>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>

        {invitations.length > 0 && (
          <ul className="mb-4 divide-y divide-slate-200 rounded-lg border border-dashed border-slate-300 bg-white">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between p-4 text-sm">
                <span className="text-slate-600">{inv.email} - invited, pending</span>
                <form action={revokeInvitation}>
                  <input type="hidden" name="invitationId" value={inv.id} />
                  <SubmitButton variant="secondary" pendingLabel="Revoking…">
                    Revoke
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={inviteOrgMember} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-xs font-medium text-slate-600">
              Invite a coach by email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="coach@example.com"
              className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="teamId" className="text-xs font-medium text-slate-600">
              Assign to team (optional)
            </label>
            <select id="teamId" name="teamId" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="">- don&rsquo;t assign yet -</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-xs font-medium text-slate-600">
              Role
            </label>
            <select id="role" name="role" defaultValue="org:member" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="org:member">Coach</option>
              <option value="org:admin">Admin</option>
            </select>
          </div>
          <SubmitButton pendingLabel="Sending…">Send invite</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Choosing a team assigns them to it automatically as soon as they accept - no separate
          step needed. You can still assign or change teams later from each team&rsquo;s
          settings page. An existing member&rsquo;s role can be changed anytime with the
          Make admin / Remove admin button next to their name above.
        </p>
      </section>
    </div>
  );
}
