"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { trainingLogs } from "@/lib/db/schema";
import { looksLikeLogToken } from "@/lib/log-token";
import { addDays, LOG_WINDOW_DAYS } from "@/lib/training-log";
import { getApprovalByToken } from "@/lib/training-log-server";

/**
 * PUBLIC: a parent opening /approve/<token> approves everything their child logged that day. The
 * secret in the link is the only credential; it only ever approves that one player on that one day,
 * and only while the day is still inside the log window.
 */
export async function approveDay(token: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!looksLikeLogToken(token)) return { ok: false, error: "This approval link isn't valid." };
  const approval = await getApprovalByToken(token);
  if (!approval) return { ok: false, error: "This approval link isn't valid." };
  if (approval.logDate < addDays(new Date().toISOString().slice(0, 10), -LOG_WINDOW_DAYS)) {
    return { ok: false, error: "This approval link has expired." };
  }
  const updated = await db
    .update(trainingLogs)
    .set({ approvedAt: new Date() })
    .where(and(eq(trainingLogs.playerId, approval.playerId), eq(trainingLogs.logDate, approval.logDate), isNull(trainingLogs.approvedAt)))
    .returning({ id: trainingLogs.id });
  revalidatePath(`/approve/${token}`);
  revalidatePath(`/teams/${approval.teamId}/training`);
  return { ok: true, count: updated.length };
}
