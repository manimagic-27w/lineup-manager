import { notFound } from "next/navigation";
import { getPlan } from "@/actions/practices";
import { requireTeamFeature } from "@/lib/features";
import { clockTimes, totalMinutes } from "@/lib/practice";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";

/** A clean one-page printout of a practice plan - its own route, like the lineup print sheet, so
 *  none of the editor needs to be reasoned about as print output. */
export default async function PracticePrintPage({ params }: { params: Promise<{ teamId: string; planId: string }> }) {
  const { teamId, planId } = await params;
  const { team } = await requireTeamFeature(teamId, "practice_plans");
  const found = await getPlan(teamId, planId);
  if (!found) notFound();
  const { plan, items } = found;
  const times = clockTimes(plan.startTime, items.map((i) => i.minutes));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6 print:max-w-none print:space-y-4 print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-slate-500">Use the button, or your browser&rsquo;s print command, to print this plan or save it as a PDF.</p>
        <PrintButton />
      </div>

      <header className="space-y-1 border-b border-slate-300 pb-3">
        <p className="text-sm font-medium text-slate-500">{team.name}</p>
        <h1 className="text-2xl font-bold text-slate-900">{plan.title}</h1>
        <p className="text-sm text-slate-600">
          {plan.practiceDate ? formatDate(plan.practiceDate) : "Practice plan"}
          {plan.startTime ? ` · starts ${times[0] ?? plan.startTime}` : ""}
          {` · ${totalMinutes(items)} min`}
        </p>
        {plan.tags.length > 0 && <p className="text-xs text-slate-500">{plan.tags.join(" · ")}</p>}
      </header>

      {plan.goals && (
        <section>
          <h2 className="mb-1 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">Goals</h2>
          <p className="whitespace-pre-line text-sm text-slate-900">{plan.goals}</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 border-b border-slate-300 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">Drills</h2>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No drills in this plan.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id} className="border-b border-slate-200 align-top">
                  <td className="w-20 py-2 pr-3 font-medium tabular-nums text-slate-500">{times[i] ?? `${i + 1}.`}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-slate-900">{it.name}</div>
                    {it.notes && <div className="mt-0.5 whitespace-pre-line text-slate-600">{it.notes}</div>}
                  </td>
                  <td className="w-16 py-2 text-right tabular-nums text-slate-700">{it.minutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
