import { describe, expect, it } from "vitest";
import {
  CLIP_LIFETIME_DAYS,
  MAX_CLIP_BYTES,
  MB,
  checkClipFile,
  cleanCaption,
  cleanUploaderName,
  clipContentType,
  clipExtension,
  clipObjectKey,
  daysLeft,
  daysLeftLabel,
  expiryFrom,
  formatClipSize,
  resolveScope,
} from "./clip-plan";

describe("clip files", () => {
  it("accepts phone video types by file name and rejects the rest", () => {
    expect(clipExtension("IMG_1234.MOV")).toBe("mov");
    expect(clipContentType("goal.mp4")).toBe("video/mp4");
    expect(clipContentType("goal.MOV")).toBe("video/quicktime");
    expect(clipContentType("notes.pdf")).toBeNull();
    expect(clipExtension("noextension")).toBeNull();
  });

  it("checks type, empty files and size", () => {
    expect(checkClipFile("a.mp4", 10 * MB).ok).toBe(true);
    expect(checkClipFile("a.mp4", MAX_CLIP_BYTES).ok).toBe(true);
    expect(checkClipFile("a.mp4", MAX_CLIP_BYTES + 1).ok).toBe(false);
    expect(checkClipFile("a.mp4", 0).ok).toBe(false);
    expect(checkClipFile("a.jpg", 1000).ok).toBe(false);
  });
});

describe("names and keys", () => {
  it("keeps a short first name and caption", () => {
    expect(cleanUploaderName("  Pat   Lee  ")).toBe("Pat Lee");
    expect(cleanUploaderName("x".repeat(100))).toHaveLength(40);
    expect(cleanCaption("  Great\n goal  ")).toBe("Great goal");
    expect(cleanCaption("y".repeat(300))).toHaveLength(120);
  });

  it("builds a storage key under the team and the game or tournament", () => {
    expect(clipObjectKey("t1", "g1", "c1", "mov")).toBe("clips/t1/g1/c1.mov");
  });
});

describe("the 60 day clock", () => {
  it("expires 60 days after upload", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(expiryFrom(now).toISOString()).toBe("2026-12-31T12:00:00.000Z");
    expect(CLIP_LIFETIME_DAYS).toBe(60);
  });

  it("counts whole days left and words them", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(daysLeft(expiryFrom(now), now)).toBe(60);
    expect(daysLeft(new Date(now.getTime() + 3_600_000), now)).toBe(1);
    expect(daysLeft(new Date(now.getTime() - 5), now)).toBe(0);
    expect(daysLeftLabel(0)).toBe("Deletes today");
    expect(daysLeftLabel(1)).toBe("Deletes tomorrow");
    expect(daysLeftLabel(14)).toBe("Deletes in 14 days");
  });

  it("shows sizes", () => {
    expect(formatClipSize(120 * MB)).toBe("120 MB");
    expect(formatClipSize(1536 * MB)).toBe("1.5 GB");
  });
});

describe("scope", () => {
  it("is exactly one of a game or a tournament", () => {
    expect(resolveScope("g", null)).toEqual({ kind: "game", id: "g" });
    expect(resolveScope(null, "t")).toEqual({ kind: "tournament", id: "t" });
    expect(resolveScope("g", "t")).toBeNull();
    expect(resolveScope(null, null)).toBeNull();
    expect(resolveScope("", undefined)).toBeNull();
  });
});
