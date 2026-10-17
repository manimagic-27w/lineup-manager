import Link from "next/link";
import { listDrills, listPlans } from "@/actions/practices";
import { requireTeamFeature } from "@/lib/features";
import { PlanEditor } from "@/components/plan-editor";

export default async function NewPracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { teamId } = await params;
  const { template } = await searchParams;
  await requireTeamFeature(teamId, "practice_plans");
  const isTemplate = template === "1";
  const [drills, plans, templates] = await Promise.all([listDrills(teamId), listPlans(teamId), listPlans(teamId, { templates: true })]);
  const knownTags = Array.from(new Set([...plans, ...templates, ...drills].flatMap((x) => x.tags)));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href={`/teams/${teamId}/practices${isTemplate ? "?view=templates" : ""}`} className="text-sm text-slate-500 hover:text-brand-blue">
          ← Practices
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">{isTemplate ? "New template" : "New practice plan"}</h2>
      </div>
      {!isTemplate && templates.length > 0 && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Want to start from a template? Open one under{" "}
          <Link href={`/teams/${teamId}/practices?view=templates`} className="text-brand-blue underline">
            Templates
          </Link>{" "}
          and choose &ldquo;Start a plan from this.&rdquo;
        </p>
      )}
      <PlanEditor
        teamId={teamId}
        knownTags={knownTags}
        library={drills.map((d) => ({ id: d.id, name: d.name, minutes: d.minutes, notes: d.notes }))}
        initial={{ id: null, title: "", practiceDate: "", startTime: "", goals: "", tags: [], isTemplate, items: [] }}
      />
    </div>
  );
}
