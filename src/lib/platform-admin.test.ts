import { describe, expect, it } from "vitest";
import { isPlatformAdminId, parsePlatformAdminIds } from "./platform-admin";

describe("platform admin ids", () => {
  it("parses comma and whitespace separated lists", () => {
    expect(parsePlatformAdminIds("user_a, user_b\nuser_c")).toEqual(["user_a", "user_b", "user_c"]);
    expect(parsePlatformAdminIds("")).toEqual([]);
    expect(parsePlatformAdminIds(undefined)).toEqual([]);
  });

  it("only matches ids that are listed", () => {
    expect(isPlatformAdminId("user_a", "user_a,user_b")).toBe(true);
    expect(isPlatformAdminId("user_x", "user_a,user_b")).toBe(false);
    expect(isPlatformAdminId(null, "user_a")).toBe(false);
    expect(isPlatformAdminId("user_a", undefined)).toBe(false);
  });
});
