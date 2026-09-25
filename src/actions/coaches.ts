"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { teamCoaches } from "@/lib/db/schema";
import { requireOrgAdmin, requireTeamAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { broadcastTeamUpdate } from "@/lib/pusher-server";

/**
 * Coach management has two layers, mirroring the plan doc:
 *  - Club membership lives entirely in Clerk (an org invitation, accepted, becomes an
 *    `org:member`). We never store users locally.
 *  - Which *teams* within the club a member coaches is `team_coaches`, the one thing Clerk
 *    doesn't know about - so assigning someone to a team is a local DB write once they're a
 *    club member.
 */

/** All members of the caller's active club, for the "assign to team" picker. */
export async function listOrgMembers() {
  const session = await requireOrgAdmin();
  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: session.orgId,
    limit: 100,
  });
  return data.map((m) => ({
    userId: m.publicUserData?.userId ?? "",
    name:
      [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") ||
      m.publicUserData?.identifier ||
      "Unknown",
    email: m.publicUserData?.identifier ?? "",
    role: m.role,
  }));
}

export async function listPendingInvitations() {
  const session = await requireOrgAdmin();
  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationInvitationList({
    organizationId: session.orgId,
    status: ["pending"],
    limit: 100,
  });
  return data.map((i) => ({ id: i.id, email: i.emailAddress, role: i.role }));
}

const inviteSchema = z.object({ email: z.string().trim().email() });

/** Invites someone to the club itself (org:member). They still need to be assigned to a
 *  specific team afterward via `assignCoachToTeam` once they show up in `listOrgMembers`. */
export async function inviteOrgMember(formData: FormData) {
  const session = await requireOrgAdmin();
  const parsed = inviteSchema.parse({ email: formData.get("email") });
  const clerk = await clerkClient();

  await clerk.organizations.createOrganizationInvitation({
    organizationId: session.orgId,
    emailAddress: parsed.email,
    role: "org:member",
    inviterUserId: session.userId,
    // Without this, Clerk sends the invite to its own hosted Account Portal instead of back
    // into the app.
    redirectUrl: `${getAppUrl()}/`,
  });

  // This is a club-level (org) invitation, not scoped to any one team, so there's no
  // `activity_log` row for it - that table is always team-scoped.

  revalidatePath("/admin");
}

export async function revokeInvitation(formData: FormData) {
  const session = await requireOrgAdmin();
  const invitationId = z.string().min(1).parse(formData.get("invitationId"));
  const clerk = await clerkClient();
  await clerk.organizations.revokeOrganizationInvitation({
    organizationId: session.orgId,
    invitationId,
    requestingUserId: session.userId,
  });
  revalidatePath("/admin");
}

const assignSchema = z.object({ teamId: z.string().uuid(), userId: z.string().min(1) });

export async function assignCoachToTeam(formData: FormData) {
  const parsed = assignSchema.parse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });
  const { userId: actorId } = await requireTeamAccess(parsed.teamId);

  await db
    .insert(teamCoaches)
    .values({ teamId: parsed.teamId, userId: parsed.userId, addedBy: actorId })
    .onConflictDoNothing();

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: actorId,
    action: "coach_assigned",
    details: parsed.userId,
  });
  await broadcastTeamUpdate(parsed.teamId, "coaches");

  revalidatePath(`/teams/${parsed.teamId}/settings`);
  revalidatePath("/admin");
}

export async function removeCoachFromTeam(formData: FormData) {
  const parsed = assignSchema.parse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });
  const { userId: actorId } = await requireTeamAccess(parsed.teamId);

  await db
    .delete(teamCoaches)
    .where(and(eq(teamCoaches.teamId, parsed.teamId), eq(teamCoaches.userId, parsed.userId)));

  await logActivity({
    teamId: parsed.teamId,
    actorUserId: actorId,
    action: "coach_removed",
    details: parsed.userId,
  });
  await broadcastTeamUpdate(parsed.teamId, "coaches");

  revalidatePath(`/teams/${parsed.teamId}/settings`);
  revalidatePath("/admin");
}

/** Team-level coaches, joined with Clerk profile data, for the team settings screen. */
export async function listTeamCoaches(teamId: string) {
  await requireTeamAccess(teamId);
  const rows = await db.select().from(teamCoaches).where(eq(teamCoaches.teamId, teamId));
  if (rows.length === 0) return [];

  const clerk = await clerkClient();
  const users = await Promise.all(
    rows.map(async (r) => {
      try {
        const u = await clerk.users.getUser(r.userId);
        return {
          userId: r.userId,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.primaryEmailAddress?.emailAddress || r.userId,
          email: u.primaryEmailAddress?.emailAddress ?? "",
        };
      } catch {
        return { userId: r.userId, name: r.userId, email: "" };
      }
    })
  );
  return users;
}
