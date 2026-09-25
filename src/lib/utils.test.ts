import { describe, expect, it } from "vitest";
import { cn, themeSwatch, THEMES } from "./utils";

describe("cn", () => {
  it("joins truthy class names with a space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("themeSwatch", () => {
  it("returns the swatch color for a known theme", () => {
    expect(themeSwatch("navy")).toBe(THEMES.find((t) => t.key === "navy")!.swatch);
  });

  it("falls back to green for an unknown theme", () => {
    expect(themeSwatch("not-a-real-theme")).toBe(THEMES.find((t) => t.key === "green")!.swatch);
  });
});
