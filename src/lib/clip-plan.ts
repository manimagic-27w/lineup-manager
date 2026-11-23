// Pure rules for parent-shared clips (no database or storage code, so they are unit tested).

export const MB = 1024 * 1024;
/** Clips are deleted this many days after they are uploaded. Shown to parents everywhere. */
export const CLIP_LIFETIME_DAYS = 60;
/** Biggest single clip accepted. */
export const MAX_CLIP_BYTES = 500 * MB;
/** The most clip storage one team can hold at a time. */
export const MAX_TEAM_CLIP_BYTES = 25 * 1024 * MB;
/** The most clips on a single game or tournament. */
export const MAX_CLIPS_PER_SCOPE = 100;
/** Uploads that never finished are cleaned up after this long. */
export const ABANDONED_UPLOAD_HOURS = 24;

export const CLIP_DELETE_NOTICE = `Clips are deleted automatically ${CLIP_LIFETIME_DAYS} days after they are uploaded. Download any clip you want to keep.`;

const TYPE_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function clipExtension(filename: string): string | null {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(filename.trim());
  const ext = m ? m[1].toLowerCase() : "";
  return ext in TYPE_BY_EXT ? ext : null;
}

/** The content type to upload with, from the file name (phones are not always honest about type). */
export function clipContentType(filename: string): string | null {
  const ext = clipExtension(filename);
  return ext ? TYPE_BY_EXT[ext] : null;
}

export type ClipCheck = { ok: true } | { ok: false; error: string };

export function checkClipFile(filename: string, bytes: number): ClipCheck {
  if (!clipExtension(filename)) return { ok: false, error: "Choose a video file (MP4, MOV, M4V or WebM)." };
  if (!Number.isFinite(bytes) || bytes < 1) return { ok: false, error: "That file looks empty." };
  if (bytes > MAX_CLIP_BYTES) return { ok: false, error: `That clip is over ${MAX_CLIP_BYTES / MB} MB. Trim it on your phone and try again.` };
  return { ok: true };
}

/** First name only, trimmed and capped, so a clip never carries more than a first name and an initial. */
export function cleanUploaderName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

export function cleanCaption(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function clipObjectKey(teamId: string, scopeId: string, clipId: string, ext: string): string {
  return `clips/${teamId}/${scopeId}/${clipId}.${ext}`;
}

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + CLIP_LIFETIME_DAYS * 86_400_000);
}

/** Whole days left (rounded up), never below 0. */
export function daysLeft(expiresAt: Date | number, now: Date | number = Date.now()): number {
  const end = typeof expiresAt === "number" ? expiresAt : expiresAt.getTime();
  const at = typeof now === "number" ? now : now.getTime();
  return Math.max(0, Math.ceil((end - at) / 86_400_000));
}

export function daysLeftLabel(days: number): string {
  if (days <= 0) return "Deletes today";
  if (days === 1) return "Deletes tomorrow";
  return `Deletes in ${days} days`;
}

export function formatClipSize(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / MB))} MB`;
}

export type ClipScope = { kind: "game" | "tournament"; id: string };

/** A clip belongs to exactly one game or one tournament. */
export function resolveScope(gameId: string | null | undefined, tournamentId: string | null | undefined): ClipScope | null {
  if (gameId && tournamentId) return null;
  if (gameId) return { kind: "game", id: gameId };
  if (tournamentId) return { kind: "tournament", id: tournamentId };
  return null;
}
