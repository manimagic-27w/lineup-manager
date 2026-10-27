import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { OpenClubButton } from "@/components/open-club-button";
import { createClub, inviteClubAdmin, resendClubInvitation, revokeClubInvitation, setClubFeature, setTeamFeature } from "@/actions/platform";
import { db } from "@/lib/db";
import { clubFeatures, clubSettings, teamFeatures, teams, CLUB_FEATURES, TEAM_FEATURES, TEAM_GENDERS } from "@/lib/db/schema";
import { isCurrentUserPlatformAdmin, requirePlatformAdmin } from "@/lib/platform";
import { parsePlatformAdminIds } from "@/lib/platform-admin";

// Above all the clubs: create a club, name its main admin, and see/open every club. Only the
// Clerk user ids in PLATFORM_ADMIN_USER_IDS can see it.
export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // First-time setup: with no platform admins configured yet, show the signed-in user's own id
  // (not a secret) so it can be pasted into PLATFORM_ADMIN_USER_IDS.
  if (parsePlatformAdminIds(process.env.PLATFORM_ADMIN_USER_IDS).length === 0) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-12">
          <h1 className="text-2xl font-semibold text-slate-900">Platform admin setup</h1>
          <p className="text-sm text-slate-600">
            No platform admins are configured yet. To make yourself one, add this value as the
            environment variable <code className="rounded bg-slate-100 px-1">PLATFORM_ADMIN_USER_IDS</code>{" "}
            (in <code className="rounded bg-slate-100 px-1">.env.local</code> and in Vercel), then redeploy:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-sm">{userId}</pre>
          <p className="text-xs text-slate-500">Separate several admins with commas.</p>
        </div>
      </Shell>
    );
  }

  await requirePlatformAdmin();
  const params = await searchParams;
  const clerk = await clerkClient();

  const [{ data: orgs }, settings, teamRows, featureRows, teamFeatureRows] = await Promise.all([
    clerk.organizations.getOrganizationList({ limit: 100, orderBy: "name", includeMembersCount: true }),
    db.select().from(clubSettings),
    db.select({ id: teams.id, orgId: teams.orgId, name: teams.name }).from(teams).orderBy(teams.name),
    db.select().from(clubFeatures),
    db.select().from(teamFeatures),
  ]);
  const teamsList = new Map<string, { id: string; name: string }[]>();
  for (const t of teamRows) {
    if (!teamsList.has(t.orgId)) teamsList.set(t.orgId, []);
    teamsList.get(t.orgId)!.push({ id: t.id, name: t.name });
  }
  const featuresByTeam = new Map<string, Set<string>>();
  for (const f of teamFeatureRows) {
    if (!featuresByTeam.has(f.teamId)) featuresByTeam.set(f.teamId, new Set());
    featuresByTeam.get(f.teamId)!.add(f.feature);
  }
  const featuresByOrg = new Map<string, Set<string>>();
  for (const f of featureRows) {
    if (!featuresByOrg.has(f.orgId)) featuresByOrg.set(f.orgId, new Set());
    featuresByOrg.get(f.orgId)!.add(f.feature);
  }
  const genderByOrg = new Map(settings.map((s) => [s.orgId, s.gender]));
  const teamsByOrg = new Map([...teamsList].map(([orgId, list]) => [orgId, list.length]));

  const invitesByOrg = new Map<string, { id: string; email: string; role: string }[]>();
  await Promise.all(
    orgs.map(async (o) => {
      const { data } = await clerk.organizations.getOrganizationInvitationList({
        organizationId: o.id,
        status: ["pending"],
        limit: 20,
      });
      invitesByOrg.set(
        o.id,
        data.map((i) => ({ id: i.id, email: i.emailAddress, role: i.role })),
      );
    }),
  );

  const isAdmin = await isCurrentUserPlatformAdmin();

  return (
    <Shell>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform admin</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create clubs, name each club&rsquo;s main admin, and jump into any club to help.
          </p>
        </div>

        {params.notice && (
          <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{params.notice}</p>
        )}
        {params.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{params.error}</p>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Create a club</h2>
          <form
            action={createClub}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className="text-xs font-medium text-slate-600">
                Club name
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="e.g. 3d Maryland"
                className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="gender" className="text-xs font-medium text-slate-600">
                Girls or boys
              </label>
              <select
                id="gender"
                name="gender"
                required
                defaultValue=""
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {TEAM_GENDERS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} club
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="adminEmail" className="text-xs font-medium text-slate-600">
                Main admin&rsquo;s email
              </label>
              <input
                id="adminEmail"
                name="adminEmail"
                type="email"
                required
                placeholder="manager@club.org"
                className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <SubmitButton pendingLabel="Creating…">Create club</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            You&rsquo;re added to the new club as its first member so you can set it up or help later;
            the main admin gets an email invitation and becomes the club&rsquo;s admin when they accept.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">All clubs ({orgs.length})</h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {orgs.length === 0 && <li className="p-4 text-sm text-slate-500">No clubs yet.</li>}
            {orgs.map((o) => {
              const gender = genderByOrg.get(o.id);
              const invites = invitesByOrg.get(o.id) ?? [];
              return (
                <li key={o.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{o.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {gender ? `${TEAM_GENDERS.find((t) => t.key === gender)?.label ?? "Girls"} club` : "Girls/Boys not set yet"}
                        {" · "}
                        {teamsByOrg.get(o.id) ?? 0} team{(teamsByOrg.get(o.id) ?? 0) === 1 ? "" : "s"}
                        {" · "}
                        {o.membersCount ?? 0} member{(o.membersCount ?? 0) === 1 ? "" : "s"}
                        {" · created "}
                        {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                    {isAdmin && <OpenClubButton orgId={o.id} />}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                    <span className="text-xs font-medium text-slate-500">Premium</span>
                    {CLUB_FEATURES.map((f) => {
                      const on = featuresByOrg.get(o.id)?.has(f.key) ?? false;
                      return (
                        <form key={f.key} action={setClubFeature} className="flex items-center gap-2">
                          <input type="hidden" name="orgId" value={o.id} />
                          <input type="hidden" name="feature" value={f.key} />
                          <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                          <span className={on ? "text-sm font-medium text-slate-900" : "text-sm text-slate-500"}>
                            {f.label}: {on ? "on" : "off"}
                          </span>
                          <SubmitButton variant="secondary" pendingLabel="Saving…">
                            {on ? "Turn off" : "Turn on"}
                          </SubmitButton>
                        </form>
                      );
                    })}
                  </div>

                  {(teamsList.get(o.id)?.length ?? 0) > 0 && (
                    <details className="rounded-md bg-slate-50 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-slate-500">
                        Team premium &ndash; {TEAM_FEATURES.map((f) => f.label).join(", ")}
                        {" ("}
                        {teamsList.get(o.id)!.filter((t) => featuresByTeam.has(t.id)).length} of {teamsList.get(o.id)!.length} teams on)
                      </summary>
                      <ul className="mt-2 divide-y divide-slate-200">
                        {teamsList.get(o.id)!.map((t) =>
                          TEAM_FEATURES.map((f) => {
                            const on = featuresByTeam.get(t.id)?.has(f.key) ?? false;
                            return (
                              <li key={`${t.id}-${f.key}`} className="py-1.5">
                                <form action={setTeamFeature} className="flex flex-wrap items-center gap-2">
                                  <input type="hidden" name="teamId" value={t.id} />
                                  <input type="hidden" name="feature" value={f.key} />
                                  <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                                  <span className={on ? "text-sm font-medium text-slate-900" : "text-sm text-slate-500"}>
                                    {t.name} &ndash; {f.label}: {on ? "on" : "off"}
                                  </span>
                                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                                    {on ? "Turn off" : "Turn on"}
                                  </SubmitButton>
                                </form>
                              </li>
                            );
                          }),
                        )}
                      </ul>
                    </details>
                  )}

                  {invites.length > 0 && (
                    <ul className="space-y-1 rounded-md border border-dashed border-slate-300 p-2">
                      {invites.map((inv) => (
                        <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-slate-600">{inv.email} &ndash; invited as {inv.role === "org:admin" ? "admin" : "coach"}, pending</span>
                          <span className="flex gap-2">
                            <form action={resendClubInvitation}>
                              <input type="hidden" name="orgId" value={o.id} />
                              <input type="hidden" name="invitationId" value={inv.id} />
                              <input type="hidden" name="email" value={inv.email} />
                              <input type="hidden" name="role" value={inv.role} />
                              <SubmitButton variant="secondary" pendingLabel="Sending…">
                                Resend
                              </SubmitButton>
                            </form>
                            <form action={revokeClubInvitation}>
                              <input type="hidden" name="orgId" value={o.id} />
                              <input type="hidden" name="invitationId" value={inv.id} />
                              <SubmitButton variant="secondary" pendingLabel="Revoking…">
                                Revoke
                              </SubmitButton>
                            </form>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form action={inviteClubAdmin} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="orgId" value={o.id} />
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="Invite another admin by email"
                      className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <SubmitButton variant="secondary" pendingLabel="Sending…">
                      Invite admin
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Logo className="text-xl sm:text-2xl" />
          <span className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">Platform admin</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-brand-blue">
            Back to my club
          </Link>
          <UserButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
