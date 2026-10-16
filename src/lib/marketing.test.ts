import { describe, expect, it } from "vitest";
import { DEMO_STEPS, REQUEST_ACCESS_HREF, adjacentStep, audienceFromParam, stepIndexFromParam } from "./marketing";

describe("marketing helpers", () => {
  it("has unique step ids with captions", () => {
    const ids = DEMO_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of DEMO_STEPS) {
      expect(s.caption.length).toBeGreaterThan(40);
      expect(s.notice.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the first step for unknown or missing params", () => {
    expect(stepIndexFromParam(undefined)).toBe(0);
    expect(stepIndexFromParam("nope")).toBe(0);
    expect(stepIndexFromParam("guests")).toBe(DEMO_STEPS.findIndex((s) => s.id === "guests"));
    expect(stepIndexFromParam(["history", "x"])).toBe(DEMO_STEPS.findIndex((s) => s.id === "history"));
  });

  it("clamps next/back at the ends", () => {
    expect(adjacentStep(0, -1)).toBe(0);
    expect(adjacentStep(0, 1)).toBe(1);
    expect(adjacentStep(DEMO_STEPS.length - 1, 1)).toBe(DEMO_STEPS.length - 1);
  });

  it("defaults the audience to coach", () => {
    expect(audienceFromParam(undefined)).toBe("coach");
    expect(audienceFromParam("club")).toBe("club");
    expect(audienceFromParam("whatever")).toBe("coach");
  });

  it("builds a mailto link", () => {
    expect(REQUEST_ACCESS_HREF.startsWith("mailto:")).toBe(true);
    expect(REQUEST_ACCESS_HREF).toContain("subject=");
  });
});
