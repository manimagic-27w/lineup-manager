import Link from "next/link";
import { listAccessibleTeams } from "@/actions/teams";
import { requireOrgSession } from "@/lib/auth";
import { themeSwatch } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await requireOrgSession();
  const isAdmin = session.has({ role: "org:admin" });
  const teams = await listAccessibleTeams();

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Your teams</h1>
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Manage club
          </Link>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-600">
            {isAdmin
              ? "This club doesn't have any teams yet."
              : "You haven't been assigned to a team yet. Ask a club admin to add you as a coach."}
          </p>
          {isAdmin && (
            <Link
              href="/admin"
              className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Create a team
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/teams/${team.id}`}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-full"
                  style={{ backgroundColor: themeSwatch(team.theme) }}
                  aria-hidden
                />
                <span className="font-medium text-slate-900">{team.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
