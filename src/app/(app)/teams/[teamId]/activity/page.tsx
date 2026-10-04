import Link from "next/link";
import { listActivity } from "@/actions/activity";
import { requireTeamAccess } from "@/lib/auth";
import { TeamRealtime } from "@/components/team-realtime";

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { teamId } = await params;
  const { page: pageParam } = await searchParams;
  await requireTeamAccess(teamId);

  const page = Math.max(0, parseInt(pageParam ?? "0", 10) || 0);
  const { entries, hasMore } = await listActivity(teamId, page);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-8 sm:px-6">
      <TeamRealtime teamId={teamId} />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <span className="font-medium text-slate-900">{e.actorName}</span>{" "}
                <span className="text-slate-600">{e.description}</span>
                <div className="mt-0.5 text-xs text-slate-400">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-between text-sm">
        {page > 0 ? (
          <Link href={`?page=${page - 1}`} className="text-slate-600 hover:text-brand-blue">
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={`?page=${page + 1}`} className="text-slate-600 hover:text-brand-blue">
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
