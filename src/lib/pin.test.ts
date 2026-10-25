import { describe, expect, it } from "vitest";
import { hashPin, isValidPin, verifyPin } from "./pin";

describe("PINs", () => {
  it("only accepts exactly four digits", () => {
    expect(isValidPin("0427")).toBe(true);
    expect(isValidPin("427")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });

  it("verifies the right PIN and rejects a wrong one", () => {
    const stored = hashPin("1234");
    expect(verifyPin("1234", stored)).toBe(true);
    expect(verifyPin("1235", stored)).toBe(false);
  });

  it("never stores the PIN itself and salts every hash", () => {
    const a = hashPin("1234");
    const b = hashPin("1234");
    expect(a).not.toContain("1234:");
    expect(a).not.toBe(b);
    expect(verifyPin("1234", b)).toBe(true);
  });

  it("fails safely with nothing stored or a malformed value", () => {
    expect(verifyPin("1234", null)).toBe(false);
    expect(verifyPin("1234", "garbage")).toBe(false);
    expect(verifyPin("12", hashPin("1234"))).toBe(false);
  });
});
