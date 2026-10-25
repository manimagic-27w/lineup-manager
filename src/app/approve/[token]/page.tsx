import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { ApproveButton } from "@/components/approve-button";
import { formatMinutes, weekdayName } from "@/lib/training-log";
import { getApprovalView } from "@/lib/training-log-server";

// A public page for parents: the secret link is the only credential. Keep it out of search engines.
export const metadata: Metadata = {
  title: "Approve training time - Lineup Manager",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function prettyDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`);
  return `${weekdayName(value)}, ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`;
}

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getApprovalView(token);
  if (!view) notFound();

  const total = view.entries.reduce((sum, e) => sum + e.minutes, 0);
  const waiting = view.entries.filter((e) => !e.approved);

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <div className="mb-6 text-center">
        <Logo className="text-3xl" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Approve training time</h1>
        <p className="mt-1 text-sm text-slate-600">
          {view.playerLabel} &middot; {view.teamName}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">{prettyDate(view.logDate)}</h2>
        {view.entries.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">There&apos;s nothing logged for this day any more.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-slate-100">
              {view.entries.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{e.kind}</p>
                    {e.note && <p className="text-xs text-slate-500">{e.note}</p>}
                  </div>
                  <p className="shrink-0 text-sm font-medium text-slate-900">
                    {formatMinutes(e.minutes)}
                    {e.approved && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Approved</span>}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right text-sm text-slate-600">
              Total: <strong className="text-slate-900">{formatMinutes(total)}</strong>
            </p>
          </>
        )}
        {waiting.length > 0 ? (
          <div className="mt-4">
            <p className="mb-3 text-sm text-slate-600">
              By approving, you confirm {view.playerLabel} did this work outside of practice.
            </p>
            <ApproveButton token={token} />
          </div>
        ) : (
          view.entries.length > 0 && <p className="mt-4 text-sm font-medium text-green-700">Everything for this day is approved. Thank you!</p>
        )}
      </div>
    </div>
  );
}
