import { describe, expect, it } from "vitest";
import { MB, TARGET_CLIP_BYTES, estimateParts, formatRemaining, nextClipSeconds, parseDurationSeconds, partFilename, shrinkSeconds, slugName } from "./film-plan";

describe("parseDurationSeconds", () => {
  it("reads ffmpeg's Duration line", () => {
    expect(parseDurationSeconds("  Duration: 01:12:30.50, start: 0.000000, bitrate: 3000 kb/s")).toBeCloseTo(4350.5);
    expect(parseDurationSeconds("no duration here")).toBeNull();
    expect(parseDurationSeconds("Duration: 00:00:00.00")).toBeNull();
  });
});

describe("clip planning", () => {
  it("estimates parts from the file size", () => {
    expect(estimateParts(50 * MB)).toBe(1);
    expect(estimateParts(2 * 1024 * MB)).toBe(11); // a 2 GB game
    expect(estimateParts(1536 * MB)).toBe(9); // a 1.5 GB game
  });
  it("sizes a clip from the bytes per second and folds in a short tail", () => {
    const bps = 3 * MB; // 3 MB/s -> about 63 s per clip
    expect(nextClipSeconds(bps, 3600)).toBeCloseTo(TARGET_CLIP_BYTES / bps);
    expect(nextClipSeconds(bps, 60)).toBe(60);
  });
  it("cuts a too-big clip shorter", () => {
    const shorter = shrinkSeconds(60, 230 * MB);
    expect(shorter).toBeLessThan(60 * 0.9 + 0.001);
    expect(shorter).toBeGreaterThan(2);
  });
});

describe("names and formatting", () => {
  it("makes safe download names", () => {
    expect(slugName("Game 3 vs Limelight (final).MOV")).toBe("Game-3-vs-Limelight-final");
    expect(partFilename("Game 3.mp4", 2, 12)).toBe("Game-3-part-02-of-12.mp4");
    expect(slugName("....")).toBe("game-film");
  });
  it("formats the countdown", () => {
    expect(formatRemaining(0)).toBe("expired");
    expect(formatRemaining(30_000)).toBe("less than a minute");
    expect(formatRemaining(9 * 60_000)).toBe("9m");
    expect(formatRemaining((21 * 60 + 14) * 60_000)).toBe("21h 14m");
  });
});
