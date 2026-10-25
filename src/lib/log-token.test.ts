import { describe, expect, it } from "vitest";
import { generateLogToken, looksLikeLogToken } from "./log-token";

describe("log tokens", () => {
  it("are 16 URL-safe characters and different each time", () => {
    const a = generateLogToken();
    expect(looksLikeLogToken(a)).toBe(true);
    expect(generateLogToken()).not.toBe(a);
  });
  it("rejects anything else", () => {
    expect(looksLikeLogToken("short")).toBe(false);
    expect(looksLikeLogToken("has spaces in it!!")).toBe(false);
    expect(looksLikeLogToken("")).toBe(false);
  });
});
