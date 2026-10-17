import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/logo";
import { OrgSwitcher } from "@/components/org-switcher";
import { SubmitButton } from "@/components/submit-button";
import { setClubGender } from "@/actions/club";
import { requireOrgSession } from "@/lib/auth";
import { getClubGender } from "@/lib/club";

// Shown once, to a brand-new club, before anything else: is this club girls or boys lacrosse?
// It lives outside the (app) layout so that layout can send clubs here without a redirect loop.
export default async function ClubSetupPage() {
  const session = await requireOrgSession();
  if ((await getClubGender(session.orgId)) !== null) redirect("/");
  const isAdmin = session.has({ role: "org:admin" });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Logo className="text-xl sm:text-2xl" />
          <OrgSwitcher />
        </div>
        <UserButton />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-12">
        {isAdmin ? (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Set up your club</h1>
              <p className="mt-2 text-sm text-slate-600">
                Is this a girls or a boys lacrosse club? This sets the lineup for every team in the
                club &ndash; girls start 12 players on the field, boys start 10 (3 attack, 3
                midfield, 3 defense and 1 goalie). You can change it later from the Admin page.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <form action={setClubGender}>
                <input type="hidden" name="gender" value="girls" />
                <SubmitButton pendingLabel="Saving…">Girls club</SubmitButton>
              </form>
              <form action={setClubGender}>
                <input type="hidden" name="gender" value="boys" />
                <SubmitButton pendingLabel="Saving…">Boys club</SubmitButton>
              </form>
            </div>
          </>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Almost ready</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your club hasn&rsquo;t finished setup yet. Ask a club admin to sign in and choose
              girls or boys &ndash; then your teams will appear here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
