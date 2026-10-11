/**
 * Pure helpers for moving the app's data from the Clerk *development* instance to a new *production*
 * instance (see scripts/migrate-clerk-ids.ts). The database itself doesn't move - only the Clerk
 * ids stored in it change - so the job is: figure out which old org / user id corresponds to which
 * new one. Organizations are matched by name and users by email address.
 */

export type ClerkOrgRef = { id: string; name: string };
export type ClerkPersonRef = { id: string; emails: string[] };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Old org id -> new org id by case-insensitive name. A name that appears more than once on
 *  either side is ambiguous, so it's reported as unmatched rather than guessed at. */
export function buildOrgMap(oldOrgs: ClerkOrgRef[], newOrgs: ClerkOrgRef[]) {
  const countNew = new Map<string, ClerkOrgRef[]>();
  for (const o of newOrgs) {
    const k = normalizeName(o.name);
    countNew.set(k, [...(countNew.get(k) ?? []), o]);
  }
  const countOld = new Map<string, number>();
  for (const o of oldOrgs) countOld.set(normalizeName(o.name), (countOld.get(normalizeName(o.name)) ?? 0) + 1);

  const map = new Map<string, string>();
  const unmatched: ClerkOrgRef[] = [];
  for (const o of oldOrgs) {
    const k = normalizeName(o.name);
    const candidates = countNew.get(k) ?? [];
    if (candidates.length === 1 && countOld.get(k) === 1) map.set(o.id, candidates[0].id);
    else unmatched.push(o);
  }
  return { map, unmatched };
}

/** Old user id -> new user id when any email address matches. A person who has not signed up
 *  in the new instance yet is returned in `unmatched`. */
export function buildUserMap(oldUsers: ClerkPersonRef[], newUsers: ClerkPersonRef[]) {
  const byEmail = new Map<string, Set<string>>();
  for (const u of newUsers) {
    for (const e of u.emails) {
      const k = normalizeEmail(e);
      byEmail.set(k, (byEmail.get(k) ?? new Set()).add(u.id));
    }
  }
  const map = new Map<string, string>();
  const unmatched: ClerkPersonRef[] = [];
  for (const u of oldUsers) {
    const ids = new Set<string>();
    for (const e of u.emails) for (const id of byEmail.get(normalizeEmail(e)) ?? []) ids.add(id);
    if (ids.size === 1) map.set(u.id, [...ids][0]);
    else unmatched.push(u);
  }
  return { map, unmatched };
}
