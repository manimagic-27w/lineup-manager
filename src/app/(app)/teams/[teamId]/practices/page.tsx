import Link from "next/link";
import { createDrill, deleteDrill, listDrills, listPlans, updateDrill } from "@/actions/practices";
import { requireTeamFeature } from "@/lib/features";
import { formatDate, cn } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import { SUGGESTED_TAGS } from "@/lib/practice";

type View = "plans" | "templates" | "drills";

type PlanSummary = Awaited<ReturnType<typeof listPlans>>[number];

/** A day of slack, so a practice earlier today still counts as upcoming. */
function upcomingCutoff() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

function PlanRow({ teamId, p }: { teamId: string; p: PlanSummary }) {
  return (
    <li>
      <Link href={`/teams/${teamId}/practices/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
        <div>
          <div className="font-medium text-slate-900">{p.title}</div>
          <div className="text-xs text-slate-500">
            {p.practiceDate ? formatDate(p.practiceDate) : p.isTemplate ? "Template" : "No date"}
            {p.startTime ? ` · ${p.startTime}` : ""}
            {" · "}
            {p.totalMinutes} min
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {p.tags.map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {t}
            </span>
          ))}
        </div>
      </Link>
    </li>
  );
}

function PlanGroup({ teamId, title, rows }: { teamId: string; title: string; rows: PlanSummary[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.map((p) => (
          <PlanRow key={p.id} teamId={teamId} p={p} />
        ))}
      </ul>
    </section>
  );
}

function hasTag(tags: string[], tag: string) {
  return tags.some((t) => t.toLowerCase() === tag.toLowerCase());
}

export default async function PracticesPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ view?: string; tag?: string }>;
}) {
  const { teamId } = await params;
  const sp = await searchParams;
  await requireTeamFeature(teamId, "practice_plans");
  const view: View = sp.view === "templates" || sp.view === "drills" ? sp.view : "plans";
  const tag = sp.tag?.trim() || "";

  const [plans, templates, drills] = await Promise.all([
    listPlans(teamId),
    listPlans(teamId, { templates: true }),
    listDrills(teamId),
  ]);

  const source = view === "plans" ? plans : view === "templates" ? templates : drills;
  const allTags = Array.from(new Set(source.flatMap((x) => x.tags))).sort((a, b) => a.localeCompare(b));
  const filter = <T extends { tags: string[] }>(rows: T[]) => (tag ? rows.filter((r) => hasTag(r.tags, tag)) : rows);

  const cutoff = upcomingCutoff();
  const shown = filter(plans);
  const upcoming = shown
    .filter((p) => p.practiceDate && p.practiceDate >= cutoff)
    .sort((a, b) => (a.practiceDate! < b.practiceDate! ? -1 : 1));
  const past = shown.filter((p) => p.practiceDate && p.practiceDate < cutoff);
  const undated = shown.filter((p) => !p.practiceDate);

  const tabHref = (v: View) => `/teams/${teamId}/practices${v === "plans" ? "" : `?view=${v}`}`;
  const tagHref = (t: string) => `/teams/${teamId}/practices?${new URLSearchParams({ ...(view !== "plans" ? { view } : {}), ...(t ? { tag: t } : {}) })}`;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(["plans", "templates", "drills"] as const).map((v) => (
            <Link
              key={v}
              href={tabHref(v)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium capitalize",
                view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
              )}
            >
              {v}
            </Link>
          ))}
        </nav>
        {view !== "drills" && (
          <Link
            href={`/teams/${teamId}/practices/new${view === "templates" ? "?template=1" : ""}`}
            className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-light"
          >
            {view === "templates" ? "New template" : "New practice plan"}
          </Link>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Filter:</span>
          <Link href={tagHref("")} className={cn("rounded-full px-2.5 py-1", !tag ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            All
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={tagHref(t)}
              className={cn("rounded-full px-2.5 py-1", tag.toLowerCase() === t.toLowerCase() ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      {view === "plans" && (
        <>
          {shown.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {tag ? `No plans tagged "${tag}".` : "No practice plans yet. Create one, or start from a template."}
            </p>
          )}
          <PlanGroup teamId={teamId} title="Upcoming" rows={upcoming} />
          <PlanGroup teamId={teamId} title="No date yet" rows={undated} />
          <PlanGroup teamId={teamId} title="Past" rows={past} />
        </>
      )}

      {view === "templates" && (
        <>
          {filter(templates).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {tag ? `No templates tagged "${tag}".` : "No templates yet. Open a plan and choose Save as template, or create one here."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {filter(templates).map((p) => (
                <PlanRow key={p.id} teamId={teamId} p={p} />
              ))}
            </ul>
          )}
        </>
      )}

      {view === "drills" && (
        <>
          <form action={createDrill} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <input type="hidden" name="teamId" value={teamId} />
            <div className="flex flex-col gap-1">
              <label htmlFor="drill-name" className="text-xs font-medium text-slate-600">
                New drill
              </label>
              <input id="drill-name" name="name" required placeholder="e.g. Box ground balls" className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="drill-min" className="text-xs font-medium text-slate-600">
                Minutes
              </label>
              <input id="drill-min" name="minutes" type="number" min={0} max={300} defaultValue={10} className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="drill-tags" className="text-xs font-medium text-slate-600">
                Tags (comma separated)
              </label>
              <input id="drill-tags" name="tags" list="tag-suggestions" placeholder="Ground balls, Defense" className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
              <datalist id="tag-suggestions">
                {SUGGESTED_TAGS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="flex w-full flex-col gap-1">
              <label htmlFor="drill-notes" className="text-xs font-medium text-slate-600">
                Notes
              </label>
              <textarea id="drill-notes" name="notes" rows={2} placeholder="Setup, coaching points" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <SubmitButton pendingLabel="Saving…">Add to library</SubmitButton>
          </form>

          {filter(drills).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {tag ? `No drills tagged "${tag}".` : "Your drill library is empty. Add drills here, or use Save to library on a drill inside a plan."}
            </p>
          ) : (
            <ul className="space-y-3">
              {filter(drills).map((d) => (
                <li key={d.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <form action={updateDrill} className="flex flex-wrap items-start gap-3">
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="drillId" value={d.id} />
                    <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
                      <input name="name" required defaultValue={d.name} aria-label="Drill name" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium" />
                      <textarea name="notes" rows={2} defaultValue={d.notes} aria-label="Drill notes" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                      <input name="tags" list="tag-suggestions" defaultValue={d.tags.join(", ")} placeholder="Tags" aria-label="Drill tags" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input name="minutes" type="number" min={0} max={300} defaultValue={d.minutes} aria-label="Minutes" className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm" />
                      <span className="text-xs text-slate-500">min</span>
                    </div>
                    <SubmitButton variant="secondary" pendingLabel="Saving…">
                      Save
                    </SubmitButton>
                  </form>
                  <form action={deleteDrill} className="mt-2">
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="drillId" value={d.id} />
                    <SubmitButton variant="danger" pendingLabel="Removing…">
                      Remove from library
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
