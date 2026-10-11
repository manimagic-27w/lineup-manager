import { describe, expect, it } from "vitest";
import { buildOrgMap, buildUserMap } from "./clerk-remap";

describe("buildOrgMap", () => {
  it("matches organizations by name, ignoring case and spacing", () => {
    const { map, unmatched } = buildOrgMap(
      [{ id: "org_old1", name: "3D Virginia" }],
      [{ id: "org_new1", name: "  3d  virginia " }]
    );
    expect(map.get("org_old1")).toBe("org_new1");
    expect(unmatched).toEqual([]);
  });

  it("reports orgs with no counterpart or an ambiguous one", () => {
    const { map, unmatched } = buildOrgMap(
      [
        { id: "o1", name: "A" },
        { id: "o2", name: "B" },
      ],
      [
        { id: "n2a", name: "B" },
        { id: "n2b", name: "B" },
      ]
    );
    expect(map.size).toBe(0);
    expect(unmatched.map((o) => o.id)).toEqual(["o1", "o2"]);
  });
});

describe("buildUserMap", () => {
  it("matches users by any shared email, case-insensitively", () => {
    const { map, unmatched } = buildUserMap(
      [
        { id: "user_old1", emails: ["Coach@Example.com"] },
        { id: "user_old2", emails: ["a@x.com", "b@x.com"] },
      ],
      [
        { id: "user_new1", emails: ["coach@example.com"] },
        { id: "user_new2", emails: ["b@x.com"] },
      ]
    );
    expect(map.get("user_old1")).toBe("user_new1");
    expect(map.get("user_old2")).toBe("user_new2");
    expect(unmatched).toEqual([]);
  });

  it("returns people who have not signed up yet as unmatched", () => {
    const { map, unmatched } = buildUserMap([{ id: "user_old1", emails: ["new@x.com"] }], []);
    expect(map.size).toBe(0);
    expect(unmatched).toEqual([{ id: "user_old1", emails: ["new@x.com"] }]);
  });

  it("does not guess when one email maps to two different new users", () => {
    const { map, unmatched } = buildUserMap(
      [{ id: "u", emails: ["a@x.com"] }],
      [
        { id: "n1", emails: ["a@x.com"] },
        { id: "n2", emails: ["a@x.com"] },
      ]
    );
    expect(map.size).toBe(0);
    expect(unmatched).toHaveLength(1);
  });
});
