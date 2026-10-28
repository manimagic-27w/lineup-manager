import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_STAT_CATEGORIES, statCategories } from "@/lib/db/schema";

export type CategoryRow = typeof statCategories.$inferSelect;

/** Inserts the default categories for `keys` that the team doesn't already have (matched by key or
 *  by name, so a hand-made "Shots" counts). Returns every category the team has afterwards. */
export async function addMissingCategories(teamId: string, keys: string[], existing: CategoryRow[]): Promise<CategoryRow[]> {
  const have = new Set(existing.flatMap((c) => [c.key, c.label.trim().toLowerCase()]));
  let order = existing.length > 0 ? Math.max(...existing.map((c) => c.sortOrder)) + 1 : 0;
  const toAdd = DEFAULT_STAT_CATEGORIES.filter((c) => keys.includes(c.key) && !have.has(c.key) && !have.has(c.label.toLowerCase())).map((c) => ({
    teamId,
    key: c.key,
    label: c.label,
    sortOrder: order++,
  }));
  if (toAdd.length === 0) return existing;
  const inserted = await db.insert(statCategories).values(toAdd).returning();
  return [...existing, ...inserted];
}

/** Default stat key -> the team's category id. A hand-made category with the same name counts as
 *  the default one. */
export function categoryIdsByKey(categories: CategoryRow[]): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const def of DEFAULT_STAT_CATEGORIES) {
    const hit = categories.find((c) => c.key === def.key) ?? categories.find((c) => c.label.trim().toLowerCase() === def.label.toLowerCase());
    if (hit) byKey.set(def.key, hit.id);
  }
  return byKey;
}
