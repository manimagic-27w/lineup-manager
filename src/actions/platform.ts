"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { and, eq } from "drizzle-orm";
import { clubFeatures, clubSettings, teamFeatures, teams, CLUB_FEATURES, TEAM_FEATURES, TEAM_GENDERS } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform";

const GENDER_KEYS = TEAM_GENDERS.map((t) => t.key) as [string, ...string[]];

function go(kind: "notice" | "error", message: string): never {
  redirect(`/platform?${kind}=${encodeURIComponent(message)}`);
}

function clerkMessage(e: unknown): string {
  const err = e as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message ?? "Something went wrong.";
}

const createClubSchema = z.object({
  name: z.string().trim().min(1, "Club name is required").max(120),
  gender: z.enum(GENDER_KEYS),
  adminEmail: z.string().trim().toLowerCase().email("Enter a valid email for the main admin"),
});

/**
 * Creates a club (Clerk organization) with the platform admin as its first member, records the
 * club's girls/boys setting so it never hits the setup screen, and emails the main admin an
 * org:admin invitation. The platform admin stays in the club (to help with support) until they
 * leave it from Clerk.
 */
export async function createClub(formData: FormData) {
  const { userId } = await requirePlatformAdmin();
  const parsed = createClubSchema.safeParse({
    name: formData.get("name"),
    gender: formData.get("gender"),
    adminEmail: formData.get("adminEmail"),
  });
  if (!parsed.success) go("error", parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { name, gender, adminEmail } = parsed.data;

  const clerk = await clerkClient();
  let orgId: string;
  try {
    const org = await clerk.organizations.createOrganization({ name, createdBy: userId });
    orgId = org.id;
  } catch (e) {
    go("error", `Couldn't create the club: ${clerkMessage(e)}`);
  }

  await db
    .insert(clubSettings)
    .values({ orgId, gender })
    .onConflictDoUpdate({ target: clubSettings.orgId, set: { gender, updatedAt: new Date() } });

  try {
    await clerk.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress: adminEmail,
      role: "org:admin",
      inviterUserId: userId,
      redirectUrl: `${getAppUrl()}/`,
    });
  } catch (e) {
    revalidatePath("/platform");
    go("error", `${name} was created, but the invitation to ${adminEmail} failed: ${clerkMessage(e)}`);
  }

  revalidatePath("/platform");
  go("notice", `Created ${name} and invited ${adminEmail} as its admin.`);
}

const inviteSchema = z.object({
  orgId: z.string().min(1),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});

/** Invites someone as an admin of an existing club (also used to fix a mistyped first invite). */
export async function inviteClubAdmin(formData: FormData) {
  const { userId } = await requirePlatformAdmin();
  const parsed = inviteSchema.safeParse({ orgId: formData.get("orgId"), email: formData.get("email") });
  if (!parsed.success) go("error", parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const clerk = await clerkClient();
  try {
    await clerk.organizations.createOrganizationInvitation({
      organizationId: parsed.data.orgId,
      emailAddress: parsed.data.email,
      role: "org:admin",
      inviterUserId: userId,
      redirectUrl: `${getAppUrl()}/`,
    });
  } catch (e) {
    go("error", `Couldn't send the invitation: ${clerkMessage(e)}`);
  }
  revalidatePath("/platform");
  go("notice", `Invited ${parsed.data.email} as an admin.`);
}

const invitationSchema = z.object({ orgId: z.string().min(1), invitationId: z.string().min(1) });

export async function revokeClubInvitation(formData: FormData) {
  const { userId } = await requirePlatformAdmin();
  const parsed = invitationSchema.parse({
    orgId: formData.get("orgId"),
    invitationId: formData.get("invitationId"),
  });
  const clerk = await clerkClient();
  try {
    await clerk.organizations.revokeOrganizationInvitation({
      organizationId: parsed.orgId,
      invitationId: parsed.invitationId,
      requestingUserId: userId,
    });
  } catch (e) {
    go("error", `Couldn't revoke the invitation: ${clerkMessage(e)}`);
  }
  revalidatePath("/platform");
  go("notice", "Invitation revoked.");
}

/** Revokes a pending invitation and sends a fresh one to the same address. */
export async function resendClubInvitation(formData: FormData) {
  const { userId } = await requirePlatformAdmin();
  const parsed = invitationSchema
    .extend({ email: z.string().email(), role: z.enum(["org:admin", "org:member"]).default("org:admin") })
    .parse({
      orgId: formData.get("orgId"),
      invitationId: formData.get("invitationId"),
      email: formData.get("email"),
      role: formData.get("role") || "org:admin",
    });
  const clerk = await clerkClient();
  try {
    await clerk.organizations.revokeOrganizationInvitation({
      organizationId: parsed.orgId,
      invitationId: parsed.invitationId,
      requestingUserId: userId,
    });
    await clerk.organizations.createOrganizationInvitation({
      organizationId: parsed.orgId,
      emailAddress: parsed.email,
      role: parsed.role,
      inviterUserId: userId,
      redirectUrl: `${getAppUrl()}/`,
    });
  } catch (e) {
    go("error", `The old invitation was cancelled but a new one couldn't be sent - use "Invite admin" to send it again: ${clerkMessage(e)}`);
  }
  revalidatePath("/platform");
  go("notice", `Sent a new invitation to ${parsed.email}.`);
}

/**
 * Makes sure the platform admin is a member (admin) of a club so they can switch into it.
 * Clubs created here already include them; older clubs may not. Returns ok so the client can
 * then switch the active organization.
 */
export async function ensureClubAccess(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requirePlatformAdmin();
  const id = z.string().min(1).parse(orgId);
  const clerk = await clerkClient();
  try {
    const { data } = await clerk.users.getOrganizationMembershipList({ userId, limit: 100 });
    if (data.some((m) => m.organization.id === id)) return { ok: true };
    await clerk.organizations.createOrganizationMembership({
      organizationId: id,
      userId,
      role: "org:admin",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: clerkMessage(e) };
  }
}

const FEATURE_KEYS = CLUB_FEATURES.map((f) => f.key) as [string, ...string[]];
const featureSchema = z.object({
  orgId: z.string().min(1),
  feature: z.enum(FEATURE_KEYS),
  enabled: z.enum(["true", "false"]),
});

/** Switches a premium feature on or off for one club. Turning it off hides the feature; what
 *  the club already created with it is kept and comes back if it is switched on again. */
export async function setClubFeature(formData: FormData) {
  const { userId } = await requirePlatformAdmin();
  const parsed = featureSchema.safeParse({
    orgId: formData.get("orgId"),
    feature: formData.get("feature"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) go("error", "Couldn't update that feature.");
  const { orgId, feature, enabled } = parsed.data;
  const label = CLUB_FEATURES.find((f) => f.key === feature)?.label ?? feature;

  if (enabled === "true") {
    await db
      .insert(clubFeatures)
      .values({ orgId, feature, enabledBy: userId })
      .onConflictDoNothing();
  } else {
    await db.delete(clubFeatures).where(and(eq(clubFeatures.orgId, orgId), eq(clubFeatures.feature, feature)));
  }
  revalidatePath("/platform");
  go("notice", `${label} ${enabled === "true" ? "enabled" : "disabled"}.`);
}

const TEAM_FEATURE_KEYS = TEAM_FEATURES.map((f) => f.key) as [string, ...string[]];
const teamFeatureSchema = z.object({
  teamId: z.string().uuid(),
  feature: z.enum(TEAM_FEATURE_KEYS),
  enabled: z.enum(["true", "false"]),
});

/** Switches a premium feature on or off for one team (game film). Turning it off hides the
 *  feature for that team; existing uploads are still erased on schedule and nothing else is lost. */
export async function setTeamFeature(formData: FormData) {
  const { userId } = await requirePlatformAdmin();
  const parsed = teamFeatureSchema.safeParse({
    teamId: formData.get("teamId"),
    feature: formData.get("feature"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) go("error", "Couldn't update that feature.");
  const { teamId, feature, enabled } = parsed.data;
  const label = TEAM_FEATURES.find((f) => f.key === feature)?.label ?? feature;

  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) go("error", "That team no longer exists.");

  if (enabled === "true") {
    await db.insert(teamFeatures).values({ teamId, feature, enabledBy: userId }).onConflictDoNothing();
  } else {
    await db.delete(teamFeatures).where(and(eq(teamFeatures.teamId, teamId), eq(teamFeatures.feature, feature)));
  }
  revalidatePath("/platform");
  go("notice", `${label} ${enabled === "true" ? "enabled" : "disabled"} for ${team.name}.`);
}
