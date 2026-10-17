"use server";

import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { drills, practicePlanItems, practicePlans } from "@/lib/db/schema";
import { requireTeamFeature } from "@/lib/features";
import { normalizeTags } from "@/lib/practice";

// Practice plans are a premium feature (see CLUB_FEATURES): every action here goes through
// requireTeamFeature, so a club without it can neither read nor write plans.

const FEATURE = "practice_plans" as const;
const uuid = z.string().uuid();
const MAX_ITEMS = 40;

export async function listPlans(teamId: string, opts: { templates?: boolean; tag?: string } = {}) {
  await requireTeamFeature(teamId, FEATURE);
  const conditions = [eq(practicePlans.teamId, teamId), eq(practicePlans.isTemplate, !!opts.templates)];
  if (opts.tag) conditions.push(sql`lower(${opts.tag}) = any (select lower(x) from unnest(${practicePlans.tags}) as x)`);
  const plans = await db
    .select()
    .from(practicePlans)
    .where(and(...conditions))
    .orderBy(desc(practicePlans.practiceDate), desc(practicePlans.updatedAt));
  if (plans.length === 0) return [];
  const items = await db
    .select({ planId: practicePlanItems.planId, minutes: practicePlanItems.minutes })
    .from(practicePlanItems)
    .where(inArray(practicePlanItems.planId, plans.map((p) => p.id)));
  const total = new Map<string, number>();
  for (const i of items) total.set(i.planId, (total.get(i.planId) ?? 0) + i.minutes);
  return plans.map((p) => ({ ...p, totalMinutes: total.get(p.id) ?? 0 }));
}

export async function getPlan(teamId: string, planId: string) {
  await requireTeamFeature(teamId, FEATURE);
  const [plan] = await db
    .select()
    .from(practicePlans)
    .where(and(eq(practicePlans.id, planId), eq(practicePlans.teamId, teamId)))
    .limit(1);
  if (!plan) return null;
  const items = await db
    .select()
    .from(practicePlanItems)
    .where(eq(practicePlanItems.planId, planId))
    .orderBy(asc(practicePlanItems.position));
  return { plan, items };
}

const planSchema = z.object({
  teamId: uuid,
  planId: uuid.nullable().optional(),
  title: z.string().trim().min(1, "Give the plan a title").max(120),
  practiceDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  startTime: z.union([z.string().regex(/^\d{1,2}:\d{2}$/), z.literal("")]),
  goals: z.string().max(4000),
  tags: z.array(z.string()).max(40),
  isTemplate: z.boolean(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Every drill needs a name").max(160),
        minutes: z.number().int().min(0).max(300),
        notes: z.string().max(4000),
      }),
    )
    .max(MAX_ITEMS),
});
export type SavePlanInput = z.input<typeof planSchema>;

/** Creates or updates a plan and replaces its drill list, in one transaction. */
export async function savePlan(input: SavePlanInput): Promise<{ id: string }> {
  const p = planSchema.parse(input);
  const { userId } = await requireTeamFeature(p.teamId, FEATURE);

  const values = {
    title: p.title,
    practiceDate: p.practiceDate || null,
    startTime: p.startTime || null,
    goals: p.goals,
    tags: normalizeTags(p.tags),
    isTemplate: p.isTemplate,
    updatedAt: new Date(),
  };

  const id = await db.transaction(async (tx) => {
    let planId = p.planId ?? null;
    if (planId) {
      const updated = await tx
        .update(practicePlans)
        .set(values)
        .where(and(eq(practicePlans.id, planId), eq(practicePlans.teamId, p.teamId)))
        .returning({ id: practicePlans.id });
      if (updated.length === 0) throw new Error("Plan not found.");
      await tx.delete(practicePlanItems).where(eq(practicePlanItems.planId, planId));
    } else {
      const [created] = await tx
        .insert(practicePlans)
        .values({ ...values, teamId: p.teamId, createdBy: userId })
        .returning({ id: practicePlans.id });
      planId = created.id;
    }
    if (p.items.length > 0) {
      await tx.insert(practicePlanItems).values(
        p.items.map((it, i) => ({ planId: planId!, position: i, name: it.name, minutes: it.minutes, notes: it.notes })),
      );
    }
    return planId;
  });

  revalidatePath(`/teams/${p.teamId}/practices`);
  return { id };
}

export async function deletePlan(teamId: string, planId: string) {
  uuid.parse(planId);
  await requireTeamFeature(teamId, FEATURE);
  await db.delete(practicePlans).where(and(eq(practicePlans.id, planId), eq(practicePlans.teamId, teamId)));
  revalidatePath(`/teams/${teamId}/practices`);
}

/**
 * Copies a plan. `as: "template"` saves a plan as a reusable template; `as: "plan"` starts a new
 * (undated) plan from a template. The copy is independent - editing it never touches the original.
 */
export async function copyPlan(teamId: string, planId: string, as: "template" | "plan"): Promise<{ id: string }> {
  uuid.parse(planId);
  const { userId } = await requireTeamFeature(teamId, FEATURE);
  const source = await getPlan(teamId, planId);
  if (!source) throw new Error("Plan not found.");

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(practicePlans)
      .values({
        teamId,
        title: source.plan.title,
        practiceDate: null,
        startTime: source.plan.startTime,
        goals: source.plan.goals,
        tags: source.plan.tags,
        isTemplate: as === "template",
        createdBy: userId,
      })
      .returning({ id: practicePlans.id });
    if (source.items.length > 0) {
      await tx.insert(practicePlanItems).values(
        source.items.map((it) => ({
          planId: created.id,
          position: it.position,
          name: it.name,
          minutes: it.minutes,
          notes: it.notes,
        })),
      );
    }
    return created.id;
  });
  revalidatePath(`/teams/${teamId}/practices`);
  return { id };
}

/* ------------------------------ Drill library ------------------------------ */

export async function listDrills(teamId: string, tag?: string) {
  await requireTeamFeature(teamId, FEATURE);
  const conditions = [eq(drills.teamId, teamId)];
  if (tag) conditions.push(sql`lower(${tag}) = any (select lower(x) from unnest(${drills.tags}) as x)`);
  return db
    .select()
    .from(drills)
    .where(and(...conditions))
    .orderBy(asc(drills.name));
}

const drillSchema = z.object({
  teamId: uuid,
  name: z.string().trim().min(1, "A drill needs a name").max(160),
  minutes: z.number().int().min(0).max(300),
  notes: z.string().max(4000),
  tags: z.array(z.string()).max(40),
});

/** Saves (or refreshes, if the name already exists) a drill in the team's library. */
export async function saveDrillToLibrary(input: z.input<typeof drillSchema>) {
  const d = drillSchema.parse(input);
  const { userId } = await requireTeamFeature(d.teamId, FEATURE);
  await db
    .insert(drills)
    .values({ teamId: d.teamId, name: d.name, minutes: d.minutes, notes: d.notes, tags: normalizeTags(d.tags), createdBy: userId })
    .onConflictDoUpdate({
      target: [drills.teamId, drills.name],
      set: { minutes: d.minutes, notes: d.notes, tags: normalizeTags(d.tags) },
    });
  revalidatePath(`/teams/${d.teamId}/practices`);
}

const drillFormSchema = z.object({
  teamId: uuid,
  drillId: uuid.optional(),
  name: z.string().trim().min(1).max(160),
  minutes: z.coerce.number().int().min(0).max(300),
  notes: z.string().max(4000),
  tags: z.string().max(400),
});

function parseDrillForm(formData: FormData) {
  return drillFormSchema.parse({
    teamId: formData.get("teamId"),
    drillId: formData.get("drillId") || undefined,
    name: formData.get("name"),
    minutes: formData.get("minutes") || 10,
    notes: formData.get("notes") ?? "",
    tags: formData.get("tags") ?? "",
  });
}

export async function createDrill(formData: FormData) {
  const d = parseDrillForm(formData);
  await saveDrillToLibrary({ teamId: d.teamId, name: d.name, minutes: d.minutes, notes: d.notes, tags: normalizeTags(d.tags) });
}

export async function updateDrill(formData: FormData) {
  const d = parseDrillForm(formData);
  if (!d.drillId) throw new Error("Missing drill.");
  await requireTeamFeature(d.teamId, FEATURE);
  await db
    .update(drills)
    .set({ name: d.name, minutes: d.minutes, notes: d.notes, tags: normalizeTags(d.tags) })
    .where(and(eq(drills.id, d.drillId), eq(drills.teamId, d.teamId)));
  revalidatePath(`/teams/${d.teamId}/practices`);
}

export async function deleteDrill(formData: FormData) {
  const teamId = uuid.parse(formData.get("teamId"));
  const drillId = uuid.parse(formData.get("drillId"));
  await requireTeamFeature(teamId, FEATURE);
  await db.delete(drills).where(and(eq(drills.id, drillId), eq(drills.teamId, teamId)));
  revalidatePath(`/teams/${teamId}/practices`);
}
