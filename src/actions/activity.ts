"use server";

import { desc, eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";

const PAGE_SIZE = 50;

/** Paginated activity feed with actor names resolved from Clerk. No artificial row cap on the
 *  underlying table (the old Sheets "Activity" tab was capped at 500 rows) - just pages. */
export async function listActivity(teamId: string, page = 0) {
  await requireTeamAccess(teamId);

  const rows = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.teamId, teamId))
    .orderBy(desc(activityLog.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(page * PAGE_SIZE);

  const hasMore = rows.length > PAGE_SIZE;
  const page_ = rows.slice(0, PAGE_SIZE);

  const uniqueActors = [...new Set(page_.map((r) => r.actorUserId))];
  const clerk = await clerkClient();
  const names = new Map<string, string>();
  await Promise.all(
    uniqueActors.map(async (id) => {
      try {
        const u = await clerk.users.getUser(id);
        names.set(id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.primaryEmailAddress?.emailAddress || id);
      } catch {
        names.set(id, id);
      }
    })
  );

  return {
    entries: page_.map((r) => ({ ...r, actorName: names.get(r.actorUserId) ?? r.actorUserId })),
    hasMore,
  };
}
