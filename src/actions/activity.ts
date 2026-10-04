"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { activityLog, games, players } from "@/lib/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { collectActivityRefs, describeActivity, type ActivityRefs } from "@/lib/activity-format";

const PAGE_SIZE = 50;

/** Paginated activity feed. Actor names come from Clerk, and the ids buried in `details`
 *  (players, games, assigned coaches) are resolved to names in batched queries so each entry
 *  reads as a sentence ("put Jordan Reyes at Low Attack 1 for the game on ...") rather than
 *  showing raw keys. No artificial row cap on the underlying table - just pages. */
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

  const ids = collectActivityRefs(page_);
  for (const r of page_) ids.userIds.add(r.actorUserId);

  const refs: ActivityRefs = { players: new Map(), games: new Map(), users: new Map() };
  const clerk = await clerkClient();

  await Promise.all([
    // Scoped by teamId so a crafted details value can never surface another team's names.
    ids.playerIds.size > 0
      ? db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(and(eq(players.teamId, teamId), inArray(players.id, [...ids.playerIds])))
          .then((rs) => rs.forEach((p) => refs.players.set(p.id, p.name)))
      : Promise.resolve(),
    ids.gameIds.size > 0
      ? db
          .select({ id: games.id, date: games.date, opponent: games.opponent })
          .from(games)
          .where(and(eq(games.teamId, teamId), inArray(games.id, [...ids.gameIds])))
          .then((rs) => rs.forEach((g) => refs.games.set(g.id, { date: g.date, opponent: g.opponent })))
      : Promise.resolve(),
    ...[...ids.userIds].map(async (id) => {
      try {
        const u = await clerk.users.getUser(id);
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.primaryEmailAddress?.emailAddress;
        if (name) refs.users.set(id, name);
      } catch {
        // Account no longer exists - callers fall back to a generic label.
      }
    }),
  ]);

  return {
    entries: page_.map((r) => ({
      ...r,
      actorName: refs.users.get(r.actorUserId) ?? "A former coach",
      description: describeActivity(r.action, r.details, refs),
    })),
    hasMore,
  };
}
