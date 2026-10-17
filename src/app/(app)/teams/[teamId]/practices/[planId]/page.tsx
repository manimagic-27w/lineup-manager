import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlan, listDrills, listPlans } from "@/actions/practices";
import { requireTeamFeature } from "@/lib/features";
import { PlanEditor } from "@/components/plan-editor";

export default async function PracticePlanPage({ params }: { params: Promise<{ teamId: string; planId: string }> }) {
  const { teamId, planId } = await params;
  await requireTeamFeature(teamId, "practice_plans");
  const found = await getPlan(teamId, planId);
  if (!found) notFound();
  const { plan, items } = found;
  const [drills, plans, templates] = await Promise.all([listDrills(teamId), listPlans(teamId), listPlans(teamId, { templates: true })]);
  const knownTags = Array.from(new Set([...plans, ...templates, ...drills].flatMap((x) => x.tags)));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href={`/teams/${teamId}/practices${plan.isTemplate ? "?view=templates" : ""}`} className="text-sm text-slate-500 hover:text-brand-blue">
          ← Practices
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">{plan.isTemplate ? "Template" : "Practice plan"}</h2>
      </div>
      <PlanEditor
        // Remount when the saved plan changes so the editor always starts from what is stored.
        key={`${plan.id}-${plan.updatedAt.getTime()}`}
        teamId={teamId}
        knownTags={knownTags}
        library={drills.map((d) => ({ id: d.id, name: d.name, minutes: d.minutes, notes: d.notes }))}
        initial={{
          id: plan.id,
          title: plan.title,
          practiceDate: plan.practiceDate ?? "",
          startTime: plan.startTime ?? "",
          goals: plan.goals,
          tags: plan.tags,
          isTemplate: plan.isTemplate,
          items: items.map((i) => ({ name: i.name, minutes: i.minutes, notes: i.notes })),
        }}
      />
    </div>
  );
}
