// Pure planning helpers for splitting game film into playable ~200 MB clips in the browser.

export const MB = 1024 * 1024;
/** What the splitter aims for. It cuts only at keyframes, so clips land a little either side. */
export const TARGET_CLIP_BYTES = 188 * MB;
/** A clip bigger than this is cut again, shorter. */
export const MAX_CLIP_BYTES = 200 * MB;
/** Biggest film accepted (also the limit for the "upload as one file" fallback). */
export const MAX_FILM_BYTES = 4 * 1024 * MB;
export const MAX_PARTS = 120;
export const FILM_LIFETIME_HOURS = 24;

/** ffmpeg prints "Duration: 00:02:00.05, start: ..." when it opens a file. */
export function parseDurationSeconds(log: string): number | null {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(log);
  if (!m) return null;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return seconds > 0 ? seconds : null;
}

export function estimateParts(fileBytes: number): number {
  return Math.max(1, Math.ceil(fileBytes / TARGET_CLIP_BYTES));
}

/** How many seconds the next clip should cover, given the film's bytes-per-second so far. A short
 *  leftover is folded into the last clip instead of becoming a tiny one. */
export function nextClipSeconds(bytesPerSec: number, remainingSec: number): number {
  const ideal = TARGET_CLIP_BYTES / Math.max(bytesPerSec, 1);
  if (remainingSec <= ideal * 1.15) return remainingSec;
  return Math.max(ideal, 5);
}

/** The clip came out too big: try again covering less time. */
export function shrinkSeconds(seconds: number, bytes: number): number {
  const ratio = (TARGET_CLIP_BYTES * 0.95) / Math.max(bytes, 1);
  return Math.max(2, seconds * Math.min(ratio, 0.9));
}

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(name);
  return m ? m[1].toLowerCase() : "mp4";
}

/** A name safe to put in a download header: letters, digits, dashes. */
export function slugName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  return base.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "game-film";
}

export function partFilename(film: string, partNo: number, partCount: number): string {
  const pad = String(partCount).length;
  return `${slugName(film)}-part-${String(partNo).padStart(Math.max(pad, 2), "0")}-of-${partCount}.mp4`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
  return `${Math.round(bytes / MB)} MB`;
}

/** "21h 14m", "9m", "less than a minute", or "expired". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "less than a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
