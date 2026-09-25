import "server-only";
import { db } from "./db";
import { activityLog } from "./db/schema";

/**
 * Appends one row to a team's activity log. Mirrors the old Sheets "Activity" tab, but with
 * no artificial row cap - the Sheets version was capped at 500 rows; here the table just grows,
 * and the activity screen paginates.
 */
export async function logActivity(params: {
  teamId: string;
  actorUserId: string;
  action: string;
  details?: string;
}) {
  await db.insert(activityLog).values({
    teamId: params.teamId,
    actorUserId: params.actorUserId,
    action: params.action,
    details: params.details ?? "",
  });
}
