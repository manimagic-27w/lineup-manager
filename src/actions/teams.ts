"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { teams, teamCoaches, statCategories, DEFAULT_STAT_CATEGORIES } from "@/lib/db/schema";
import { requireOrgAdmin, requireOrgSession, requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { THEMES } from "@/lib/utils";

const THEME_KEYS = THEMES.map((t) => t.key) as [string, ...string[]];

/** Every team the caller may see in their active club: all of them for an org:admin, only the
 *  ones they coach for anyone else. This is the multi-team "hub" view from the old Sheets app. */
export async function listAccessibleTeams() {
  const session = await requireOrgSession();
  const isAdmin = session.has({ role: "org:admin" });

  if (isAdmin) {
    return db.select().from(teams).where(eq(teams.orgId, session.orgId)).orderBy(teams.name);
  }

  const rows = await db
    .select({ team: teams })
    .from(teamCoaches)
    .innerJoin(teams, eq(teams.id, teamCoaches.teamId))
    .where(and(eq(teamCoaches.userId, session.userId), eq(teams.orgId, session.orgId)));

  return rows.map((r) => r.team).sort((a, b) => a.name.localeCompare(b.name));
}

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  theme: z.enum(THEME_KEYS).default("green"),
});

export async function createTeam(formData: FormData) {
  const session = await requireOrgAdmin();
  const parsed = createTeamSchema.parse({
    name: formData.get("name"),
    theme: formData.get("theme") || "green",
  });

  const [team] = await db
    .insert(teams)
    .values({
      orgId: session.orgId,
      name: parsed.name,
      theme: parsed.theme,
      createdBy: session.userId,
    })
    .returning();

  // The admin who creates a team is auto-added as a coach so they can see it immediately.
  await db.insert(teamCoaches).values({
    teamId: team.id,
    userId: session.userId,
    addedBy: session.userId,
  });

  await logActivity({
    teamId: team.id,
    actorUserId: session.userId,
    action: "team_created",
    details: team.name,
  });

  revalidatePath("/");
  revalidatePath("/admin");
}

const renameTeamSchema = z.object({ teamId: z.string().uuid(), name: z.string().trim().min(1).max(120) });

export async function renameTeam(formData: FormData) {
  const parsed = renameTeamSchema.parse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });
  const { userId, isAdmin } = await requireTeamAccess(parsed.teamId);
  if (!isAdmin) throw new Error("Only club admins can rename a team.");

  await db.update(teams).set({ name: parsed.name }).where(eq(teams.id, parsed.teamId));
  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "team_renamed",
    details: parsed.name,
  });

  revalidatePath("/admin");
  revalidatePath(`/teams/${parsed.teamId}`);
}

const setThemeSchema = z.object({ teamId: z.string().uuid(), theme: z.enum(THEME_KEYS) });

export async function setTeamTheme(formData: FormData) {
  const parsed = setThemeSchema.parse({
    teamId: formData.get("teamId"),
    theme: formData.get("theme"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db.update(teams).set({ theme: parsed.theme }).where(eq(teams.id, parsed.teamId));
  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "team_theme_changed",
    details: parsed.theme,
  });

  revalidatePath(`/teams/${parsed.teamId}`);
}

/** One-time action behind the "Enable stats tracking" button: seeds the five default stat
 *  categories for a team that has none yet. Idempotent - a team with categories already is a
 *  no-op, which is also what makes the button disappear (its presence is driven by count = 0). */
export async function enableStatsForTeam(formData: FormData) {
  const teamId = z.string().uuid().parse(formData.get("teamId"));
  const { userId, team } = await requireTeamAccess(teamId);

  const existing = await db
    .select({ id: statCategories.id })
    .from(statCategories)
    .where(eq(statCategories.teamId, teamId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(statCategories).values(
    DEFAULT_STAT_CATEGORIES.map((cat, i) => ({
      teamId,
      key: cat.key,
      label: cat.label,
      sortOrder: i,
    }))
  );

  await logActivity({
    teamId,
    actorUserId: userId,
    action: "stats_enabled",
    details: team.name,
  });

  revalidatePath(`/teams/${teamId}/stats`);
}
