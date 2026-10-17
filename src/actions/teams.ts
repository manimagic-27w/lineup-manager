"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { teams, teamCoaches, statCategories, DEFAULT_STAT_CATEGORIES, TEAM_TYPES, TEAM_GENDERS } from "@/lib/db/schema";
import { requireOrgAdmin, requireOrgSession, requireTeamAccess } from "@/lib/auth";
import { reconcileMyPendingAssignments } from "@/actions/coaches";
import { logActivity } from "@/lib/activity";
import { THEMES } from "@/lib/utils";

const THEME_KEYS = THEMES.map((t) => t.key) as [string, ...string[]];
const TEAM_TYPE_KEYS = TEAM_TYPES.map((t) => t.key) as [string, ...string[]];
const TEAM_GENDER_KEYS = TEAM_GENDERS.map((t) => t.key) as [string, ...string[]];

/** Every team the caller may see in their active club: all of them for an org:admin, only the
 *  ones they coach for anyone else. This is the multi-team "hub" view from the old Sheets app. */
export async function listAccessibleTeams() {
  const session = await requireOrgSession();
  const isAdmin = session.has({ role: "org:admin" });

  if (isAdmin) {
    return db.select().from(teams).where(eq(teams.orgId, session.orgId)).orderBy(teams.name);
  }

  // Catches up any invite-time team assignment that's still waiting on the coach to show up as
  // a real club member - see reconcileMyPendingAssignments for why this can't just happen once,
  // server-side, the moment they accept the Clerk invite.
  await reconcileMyPendingAssignments();

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
  teamType: z.enum(TEAM_TYPE_KEYS).default("travel"),
  gender: z.enum(TEAM_GENDER_KEYS).default("girls"),
});

export async function createTeam(formData: FormData) {
  const session = await requireOrgAdmin();
  const parsed = createTeamSchema.parse({
    name: formData.get("name"),
    theme: formData.get("theme") || "green",
    teamType: formData.get("teamType") || "travel",
    gender: formData.get("gender") || "girls",
  });

  const [team] = await db
    .insert(teams)
    .values({
      orgId: session.orgId,
      name: parsed.name,
      theme: parsed.theme,
      teamType: parsed.teamType,
      gender: parsed.gender,
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

const setTeamTypeSchema = z.object({ teamId: z.string().uuid(), teamType: z.enum(TEAM_TYPE_KEYS) });

// Changing a team's type only changes which Experience options the roster page offers going
// forward - it never touches any player's already-saved experience value, even if that value
// isn't one of the new set's options (same "pin the legacy value in" handling as CSV imports -
// see roster-table.tsx).
export async function setTeamType(formData: FormData) {
  const parsed = setTeamTypeSchema.parse({
    teamId: formData.get("teamId"),
    teamType: formData.get("teamType"),
  });
  const { userId } = await requireTeamAccess(parsed.teamId);

  await db.update(teams).set({ teamType: parsed.teamType }).where(eq(teams.id, parsed.teamId));
  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "team_type_changed",
    details: parsed.teamType,
  });

  revalidatePath(`/teams/${parsed.teamId}`);
}

const setTeamGenderSchema = z.object({ teamId: z.string().uuid(), gender: z.enum(TEAM_GENDER_KEYS) });

// A team's gender decides the slots on a regular (field) game's lineup board: girls 12 starters,
// boys 10 (3 attack, 3 midfield, 3 defense, 1 goalie). Switching never deletes anything - lineup
// picks are stored under slot keys that belong to one set or the other, so existing field-game
// lineups simply stop showing (and come back if the setting is switched back). Sixes and sevens
// lineups are the same for both and are unaffected.
export async function setTeamGender(formData: FormData) {
  const parsed = setTeamGenderSchema.parse({
    teamId: formData.get("teamId"),
    gender: formData.get("gender"),
  });
  const { userId, team } = await requireTeamAccess(parsed.teamId);
  if (team.gender === parsed.gender) return;

  await db.update(teams).set({ gender: parsed.gender }).where(eq(teams.id, parsed.teamId));
  await logActivity({
    teamId: parsed.teamId,
    actorUserId: userId,
    action: "team_gender_changed",
    details: parsed.gender,
  });

  revalidatePath("/admin");
  revalidatePath(`/teams/${parsed.teamId}`, "layout");
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
