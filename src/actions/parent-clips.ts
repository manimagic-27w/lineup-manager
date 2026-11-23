"use server";

import { z } from "zod";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { games, parentClips, teams, tournaments } from "@/lib/db/schema";
import { auth } from "@clerk/nextjs/server";
import { requireTeamAccess } from "@/lib/auth";
import { isPlatformAdminId } from "@/lib/platform-admin";
import { requirePlatformAdmin } from "@/lib/platform";
import { teamHasFeature } from "@/lib/features";
import { logActivity } from "@/lib/activity";
import { openFilmIndex } from "@/lib/film-index-server";
import {
  CLIP_LIFETIME_DAYS,
  MAX_CLIPS_PER_SCOPE,
  MAX_CLIP_BYTES,
  MAX_TEAM_CLIP_BYTES,
  checkClipFile,
  cleanCaption,
  cleanUploaderName,
  clipContentType,
  clipExtension,
  clipObjectKey,
  expiryFrom,
  resolveScope,
} from "@/lib/clip-plan";
import { eraseClips, purgeExpiredClips } from "@/lib/clip-storage";
import { clipBucket, clipStorageConfigured, objectSize, presignDownload, presignUpload, presignView } from "@/lib/r2";

// Parent clips: a premium per-team feature (TEAM_FEATURES "parent_clips"). The first group of actions
// is PUBLIC - parents use them from the parents' video page (/film/<token>) without signing in. The
// team's secret link plus the PIN are checked on every call, and the feature must be switched on for
// the team. Every action re-checks that the game, tournament and clip belong to that team. A coach
// can delete any clip from the Games tab (deleteParentClip, needs team access).

type Failure = { ok: false; error: string };
const NOT_ON = "Clip sharing isn't turned on for this team.";
const NOT_SETUP = "Clip uploads aren't set up yet. Ask your coach.";

type Access = { ok: true; teamId: string } | Failure;

/** Link + PIN, then the feature check and storage check. */
async function openClips(token: string, pin: string): Promise<Access> {
  const access = await openFilmIndex(token, pin);
  if (!access.ok) return access;
  if (!(await teamHasFeature(access.team.id, "parent_clips"))) return { ok: false, error: NOT_ON };
  return { ok: true, teamId: access.team.id };
}

export type ClipDTO = {
  id: string;
  gameId: string | null;
  tournamentId: string | null;
  uploaderName: string;
  caption: string;
  filename: string;
  bytes: number;
  createdAtMs: number;
  expiresAtMs: number;
};
export type ClipGameOption = { id: string; date: string; opponent: string | null };
export type ClipTournamentOption = { id: string; name: string };

/** Everything the clips section of the parents' page shows. `enabled: false` hides the section. */
export async function getClipsHub(
  token: string,
  pin: string,
): Promise<
  | { ok: true; enabled: false }
  | { ok: true; enabled: true; configured: boolean; games: ClipGameOption[]; tournaments: ClipTournamentOption[]; clips: ClipDTO[] }
  | Failure
> {
  const access = await openFilmIndex(token, pin);
  if (!access.ok) return access;
  const teamId = access.team.id;
  if (!(await teamHasFeature(teamId, "parent_clips"))) return { ok: true, enabled: false };
  if (clipStorageConfigured()) await purgeExpiredClips(teamId);

  const [gameRows, tournamentRows, clipRows] = await Promise.all([
    db.select({ id: games.id, date: games.date, opponent: games.opponent }).from(games).where(eq(games.teamId, teamId)).orderBy(desc(games.date)).limit(80),
    db.select({ id: tournaments.id, name: tournaments.name }).from(tournaments).where(eq(tournaments.teamId, teamId)).orderBy(desc(tournaments.createdAt)),
    db
      .select()
      .from(parentClips)
      .where(and(eq(parentClips.teamId, teamId), eq(parentClips.status, "ready"), isNotNull(parentClips.expiresAt), gt(parentClips.expiresAt, new Date())))
      .orderBy(desc(parentClips.createdAt)),
  ]);
  return {
    ok: true,
    enabled: true,
    configured: clipStorageConfigured(),
    games: gameRows,
    tournaments: tournamentRows,
    clips: clipRows.map((c) => ({
      id: c.id,
      gameId: c.gameId,
      tournamentId: c.tournamentId,
      uploaderName: c.uploaderName,
      caption: c.caption,
      filename: c.filename,
      bytes: c.bytes,
      createdAtMs: c.createdAt.getTime(),
      expiresAtMs: c.expiresAt!.getTime(),
    })),
  };
}

const startSchema = z.object({
  token: z.string(),
  pin: z.string(),
  gameId: z.string().uuid().nullable().optional(),
  tournamentId: z.string().uuid().nullable().optional(),
  filename: z.string().trim().min(1).max(200),
  bytes: z.number().int().min(1).max(MAX_CLIP_BYTES),
  uploaderName: z.string(),
  caption: z.string().max(500).default(""),
});

/** Step 1: validates the clip, records it as "uploading", and returns a one-hour upload link. */
export async function startClipUpload(
  input: z.input<typeof startSchema>,
): Promise<{ ok: true; clipId: string; url: string; contentType: string } | Failure> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That clip isn't valid. Choose a video up to 500 MB." };
  const v = parsed.data;
  const access = await openClips(v.token, v.pin);
  if (!access.ok) return access;
  if (!clipStorageConfigured()) return { ok: false, error: NOT_SETUP };

  const file = checkClipFile(v.filename, v.bytes);
  if (!file.ok) return file;
  const uploaderName = cleanUploaderName(v.uploaderName);
  if (!uploaderName) return { ok: false, error: "Enter your first name so other parents know who shared it." };
  const scope = resolveScope(v.gameId, v.tournamentId);
  if (!scope) return { ok: false, error: "Choose a game or a tournament for this clip." };

  const teamId = access.teamId;
  if (scope.kind === "game") {
    const [g] = await db.select({ id: games.id }).from(games).where(and(eq(games.id, scope.id), eq(games.teamId, teamId))).limit(1);
    if (!g) return { ok: false, error: "That game wasn't found." };
  } else {
    const [t] = await db.select({ id: tournaments.id }).from(tournaments).where(and(eq(tournaments.id, scope.id), eq(tournaments.teamId, teamId))).limit(1);
    if (!t) return { ok: false, error: "That tournament wasn't found." };
  }

  const scopeWhere = scope.kind === "game" ? eq(parentClips.gameId, scope.id) : eq(parentClips.tournamentId, scope.id);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(parentClips).where(scopeWhere);
  if (n >= MAX_CLIPS_PER_SCOPE) return { ok: false, error: "This game or tournament already has the most clips it can hold." };
  const [{ used }] = await db
    .select({ used: sql<number>`coalesce(sum(${parentClips.bytes}), 0)::float8` })
    .from(parentClips)
    .where(eq(parentClips.teamId, teamId));
  if (used + v.bytes > MAX_TEAM_CLIP_BYTES) return { ok: false, error: "The team's clip storage is full. Clips free up space as they are deleted after 60 days, or a coach can delete some." };

  const ext = clipExtension(v.filename)!;
  const contentType = clipContentType(v.filename)!;
  const [row] = await db
    .insert(parentClips)
    .values({
      teamId,
      gameId: scope.kind === "game" ? scope.id : null,
      tournamentId: scope.kind === "tournament" ? scope.id : null,
      uploaderName,
      caption: cleanCaption(v.caption),
      filename: v.filename,
      contentType,
      objectKey: "pending",
      bytes: v.bytes,
    })
    .returning({ id: parentClips.id });
  const key = clipObjectKey(teamId, scope.id, row.id, ext);
  await db.update(parentClips).set({ objectKey: key }).where(eq(parentClips.id, row.id));
  const url = await presignUpload(key, 3600, { bucket: clipBucket(), contentType });
  return { ok: true, clipId: row.id, url, contentType };
}

async function findClip(teamId: string, clipId: string) {
  const id = z.string().uuid().safeParse(clipId);
  if (!id.success) return null;
  const [clip] = await db.select().from(parentClips).where(and(eq(parentClips.id, id.data), eq(parentClips.teamId, teamId))).limit(1);
  return clip ?? null;
}

/** Step 2: the browser finished sending the file. Confirms it is really in storage, then starts its 60 days. */
export async function finishClipUpload(input: { token: string; pin: string; clipId: string }): Promise<{ ok: true } | Failure> {
  const access = await openClips(input.token, input.pin);
  if (!access.ok) return access;
  const clip = await findClip(access.teamId, input.clipId);
  if (!clip || clip.status !== "uploading") return { ok: false, error: "This upload is no longer open. Start it again." };
  const size = await objectSize(clip.objectKey, clipBucket());
  if (!size) return { ok: false, error: "That clip didn't arrive in storage. Try again." };
  if (size > MAX_CLIP_BYTES) {
    await eraseClips([clip.id]);
    return { ok: false, error: "That clip is too large." };
  }
  await db.update(parentClips).set({ status: "ready", bytes: size, expiresAt: expiryFrom(new Date()) }).where(eq(parentClips.id, clip.id));
  revalidatePath(`/teams/${access.teamId}/games`);
  return { ok: true };
}

/** An upload that failed or was cancelled: erase whatever reached storage. */
export async function cancelClipUpload(input: { token: string; pin: string; clipId: string }): Promise<{ ok: true } | Failure> {
  const access = await openClips(input.token, input.pin);
  if (!access.ok) return access;
  const clip = await findClip(access.teamId, input.clipId);
  if (clip && clip.status === "uploading") await eraseClips([clip.id]);
  return { ok: true };
}

/** One-hour links to play a clip and to download it. */
export async function getClipLinks(input: { token: string; pin: string; clipId: string }): Promise<{ ok: true; viewUrl: string; downloadUrl: string } | Failure> {
  const access = await openClips(input.token, input.pin);
  if (!access.ok) return access;
  if (!clipStorageConfigured()) return { ok: false, error: NOT_SETUP };
  const clip = await findClip(access.teamId, input.clipId);
  if (!clip || clip.status !== "ready" || !clip.expiresAt || clip.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: `That clip was deleted (clips are removed ${CLIP_LIFETIME_DAYS} days after upload).` };
  }
  const opts = { bucket: clipBucket(), contentType: clip.contentType };
  const [viewUrl, downloadUrl] = await Promise.all([presignView(clip.objectKey, 3600, opts), presignDownload(clip.objectKey, clip.filename, 3600, opts)]);
  return { ok: true, viewUrl, downloadUrl };
}

/**
 * Who may manage clips (change the description, delete): a coach of the team, a club admin
 * (requireTeamAccess covers both), or a platform admin, who may not be a member of the club.
 */
async function requireClipEditor(teamId: string): Promise<{ userId: string; teamId: string }> {
  const id = z.string().uuid().parse(teamId);
  const { userId } = await auth();
  if (userId && isPlatformAdminId(userId, process.env.PLATFORM_ADMIN_USER_IDS)) {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, id)).limit(1);
    if (team) return { userId, teamId: id };
  }
  const access = await requireTeamAccess(id);
  return { userId: access.userId, teamId: id };
}

/** Coach, club admin or platform admin: delete any clip now (works even if the feature is later switched off). */
export async function deleteParentClip(teamId: string, clipId: string): Promise<{ ok: true } | Failure> {
  const { userId } = await requireClipEditor(teamId);
  const clip = await findClip(teamId, clipId);
  if (!clip) return { ok: true };
  await eraseClips([clip.id]);
  await logActivity({ teamId, actorUserId: userId, action: "clip_deleted", details: clip.filename });
  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath("/platform");
  return { ok: true };
}

/**
 * Coach, club admin or platform admin: set or fix a clip's description when the parent left it blank
 * (or got it wrong). An empty description is allowed - parents then see the file name instead.
 */
export async function updateParentClipCaption(teamId: string, clipId: string, caption: string): Promise<{ ok: true; caption: string } | Failure> {
  const { userId } = await requireClipEditor(teamId);
  const clip = await findClip(teamId, clipId);
  if (!clip) return { ok: false, error: "That clip no longer exists." };
  const clean = cleanCaption(typeof caption === "string" ? caption : "");
  await db.update(parentClips).set({ caption: clean }).where(eq(parentClips.id, clip.id));
  await logActivity({ teamId, actorUserId: userId, action: "clip_updated", details: clean || clip.filename });
  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath("/platform");
  return { ok: true, caption: clean };
}

export type CoachClipDTO = ClipDTO & { scopeLabel: string; teamId: string };

const readyClips = () => and(eq(parentClips.status, "ready"), isNotNull(parentClips.expiresAt), gt(parentClips.expiresAt, new Date()));

async function loadCoachClips(where: ReturnType<typeof and>): Promise<CoachClipDTO[]> {
  const rows = await db
    .select({ clip: parentClips, date: games.date, opponent: games.opponent, tournamentName: tournaments.name })
    .from(parentClips)
    .leftJoin(games, eq(games.id, parentClips.gameId))
    .leftJoin(tournaments, eq(tournaments.id, parentClips.tournamentId))
    .where(where)
    .orderBy(desc(parentClips.createdAt));
  return rows.map(({ clip, date, opponent, tournamentName }) => ({
    id: clip.id,
    teamId: clip.teamId,
    gameId: clip.gameId,
    tournamentId: clip.tournamentId,
    uploaderName: clip.uploaderName,
    caption: clip.caption,
    filename: clip.filename,
    bytes: Number(clip.bytes),
    createdAtMs: clip.createdAt.getTime(),
    expiresAtMs: (clip.expiresAt as Date).getTime(),
    scopeLabel: tournamentName ? `Tournament: ${tournamentName}` : date ? `${date}${opponent ? ` vs ${opponent}` : ""}` : "Game",
  }));
}

/** Coach, club admin or platform admin: every clip currently shared for the team, newest first. */
export async function listParentClips(teamId: string): Promise<CoachClipDTO[]> {
  const { teamId: id } = await requireClipEditor(teamId);
  return loadCoachClips(and(eq(parentClips.teamId, id), readyClips()));
}

/** Platform admin only: every shared clip across all clubs (for the platform page). */
export async function listAllParentClips(): Promise<CoachClipDTO[]> {
  await requirePlatformAdmin();
  return loadCoachClips(readyClips());
}
