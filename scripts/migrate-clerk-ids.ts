/**
 * One-time move of the app's data from the Clerk DEVELOPMENT instance to a new PRODUCTION
 * instance. The database stays exactly where it is - every team, roster, game, lineup and stat is
 * kept - but the rows point at Clerk ids (organization = club, user = coach) that only exist in
 * the old instance. This rewrites those ids to their production equivalents:
 *
 *   - clubs are matched by NAME   (so create the club in production with the same name first)
 *   - coaches are matched by EMAIL (anyone who has already signed up in production is remapped
 *     in place; anyone who hasn't becomes a pending assignment by email, which the app
 *     applies automatically the first time that person is a club member and an admin loads the
 *     Admin page - same mechanism as "invite and assign to a team")
 *
 * It does nothing unless you pass --apply, and --apply runs in a single transaction (all or
 * nothing). Safe to re-run: ids that were already converted are simply no longer found.
 *
 * Usage (from the repo root, after taking a Neon backup branch):
 *
 *   OLD_CLERK_SECRET_KEY=sk_test_...  NEW_CLERK_SECRET_KEY=sk_live_...  npm run migrate:clerk-ids
 *   OLD_CLERK_SECRET_KEY=sk_test_...  NEW_CLERK_SECRET_KEY=sk_live_...  npm run migrate:clerk-ids -- --apply
 *
 * DATABASE_URL comes from .env.local like everything else. The Clerk keys are read from the
 * environment only and are never written anywhere.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
loadEnv({ path: existsSync(".env.local") ? ".env.local" : ".env" });

import { createClerkClient } from "@clerk/backend";
import { sql } from "drizzle-orm";
import { buildOrgMap, buildUserMap, normalizeEmail, type ClerkPersonRef } from "../src/lib/clerk-remap";

const apply = process.argv.includes("--apply");

function requireKey(name: string, prefix: string) {
  const v = process.env[name];
  if (!v || !v.startsWith(prefix)) {
    console.error(`Set ${name} (it should start with "${prefix}").`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const oldKey = requireKey("OLD_CLERK_SECRET_KEY", "sk_test_");
  const newKey = requireKey("NEW_CLERK_SECRET_KEY", "sk_live_");
  const oldClerk = createClerkClient({ secretKey: oldKey });
  const newClerk = createClerkClient({ secretKey: newKey });
  const { db } = await import("../src/lib/db");

  console.log(apply ? "== APPLY MODE: changes will be written ==" : "== DRY RUN: nothing will be changed (add --apply) ==");

  // ---- Clubs ---------------------------------------------------------------------------
  const orgRows = (await db.execute(sql`SELECT DISTINCT org_id FROM teams`)).rows as { org_id: string }[];
  const oldOrgs: { id: string; name: string }[] = [];
  for (const { org_id } of orgRows) {
    if (org_id.startsWith("org_")) {
      try {
        const o = await oldClerk.organizations.getOrganization({ organizationId: org_id });
        oldOrgs.push({ id: o.id, name: o.name });
      } catch {
        console.warn(`  ! Could not find club ${org_id} in the old Clerk instance - skipping it.`);
      }
    }
  }
  const newOrgs: { id: string; name: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await newClerk.organizations.getOrganizationList({ limit: 100, offset });
    newOrgs.push(...page.data.map((o) => ({ id: o.id, name: o.name })));
    if (newOrgs.length >= page.totalCount || page.data.length === 0) break;
  }
  const orgs = buildOrgMap(oldOrgs, newOrgs);
  console.log("\nClubs");
  for (const o of oldOrgs) {
    const to = orgs.map.get(o.id);
    console.log(to ? `  OK  "${o.name}"  ${o.id} -> ${to}` : `  !!  "${o.name}"  has no matching club (by name) in production - create it first`);
  }

  // ---- Coaches -------------------------------------------------------------------------
  const idRows = (
    await db.execute(sql`
      SELECT DISTINCT id FROM (
        SELECT created_by AS id FROM teams
        UNION SELECT user_id FROM team_coaches
        UNION SELECT added_by FROM team_coaches
        UNION SELECT invited_by FROM pending_coach_assignments
        UNION SELECT created_by FROM seasons
        UNION SELECT created_by FROM games
        UNION SELECT updated_by FROM stat_values
        UNION SELECT actor_user_id FROM activity_log
      ) t WHERE id LIKE 'user\\_%'`)
  ).rows as { id: string }[];

  const oldPeople: ClerkPersonRef[] = [];
  for (const { id } of idRows) {
    try {
      const u = await oldClerk.users.getUser(id);
      oldPeople.push({ id, emails: u.emailAddresses.map((e) => normalizeEmail(e.emailAddress)) });
    } catch {
      // Deleted from the old instance: can't be matched, rows keep the old id.
    }
  }
  const allEmails = [...new Set(oldPeople.flatMap((p) => p.emails))];
  const newPeople: ClerkPersonRef[] = [];
  for (let i = 0; i < allEmails.length; i += 50) {
    const page = await newClerk.users.getUserList({ emailAddress: allEmails.slice(i, i + 50), limit: 100 });
    newPeople.push(...page.data.map((u) => ({ id: u.id, emails: u.emailAddresses.map((e) => normalizeEmail(e.emailAddress)) })));
  }
  const users = buildUserMap(oldPeople, newPeople);
  console.log("\nPeople");
  for (const p of oldPeople) {
    const to = users.map.get(p.id);
    console.log(to ? `  OK  ${p.emails[0]}  ${p.id} -> ${to}` : `  --  ${p.emails[0] ?? p.id}  not signed up in production yet -> becomes a pending team assignment`);
  }

  if (!apply) {
    console.log("\nDry run complete. Review the lists above, then re-run with --apply.");
    return;
  }

  // ---- Apply (one transaction) --------------------------------------------------------
  await db.transaction(async (tx) => {
    for (const [oldId, newId] of orgs.map) {
      const r = await tx.execute(sql`UPDATE teams SET org_id = ${newId} WHERE org_id = ${oldId}`);
      console.log(`teams: ${r.rowCount ?? 0} moved to club ${newId}`);
    }

    // Coaches who haven't signed up in production: turn their team assignments into email-based
    // pending assignments, then drop the old rows.
    for (const p of users.unmatched) {
      const email = p.emails[0];
      if (!email) continue;
      await tx.execute(sql`
        INSERT INTO pending_coach_assignments (team_id, email, invited_by)
        SELECT tc.team_id, ${email}, tc.added_by FROM team_coaches tc
        WHERE tc.user_id = ${p.id}
          AND NOT EXISTS (SELECT 1 FROM pending_coach_assignments x WHERE x.team_id = tc.team_id AND x.email = ${email})`);
      await tx.execute(sql`DELETE FROM team_coaches WHERE user_id = ${p.id}`);
    }

    // Coaches who have: rewrite every column that stores their id.
    for (const [oldId, newId] of users.map) {
      await tx.execute(sql`
        INSERT INTO team_coaches (team_id, user_id, added_at, added_by)
        SELECT team_id, ${newId}, added_at, added_by FROM team_coaches WHERE user_id = ${oldId}
        ON CONFLICT DO NOTHING`);
      await tx.execute(sql`DELETE FROM team_coaches WHERE user_id = ${oldId}`);
      await tx.execute(sql`UPDATE team_coaches SET added_by = ${newId} WHERE added_by = ${oldId}`);
      await tx.execute(sql`UPDATE teams SET created_by = ${newId} WHERE created_by = ${oldId}`);
      await tx.execute(sql`UPDATE pending_coach_assignments SET invited_by = ${newId} WHERE invited_by = ${oldId}`);
      await tx.execute(sql`UPDATE seasons SET created_by = ${newId} WHERE created_by = ${oldId}`);
      await tx.execute(sql`UPDATE games SET created_by = ${newId} WHERE created_by = ${oldId}`);
      await tx.execute(sql`UPDATE stat_values SET updated_by = ${newId} WHERE updated_by = ${oldId}`);
      await tx.execute(sql`UPDATE activity_log SET actor_user_id = ${newId} WHERE actor_user_id = ${oldId}`);
      // Older coach_assigned / coach_removed entries store the coach's id in the details text.
      await tx.execute(sql`
        UPDATE activity_log SET details = ${newId}
        WHERE action IN ('coach_assigned', 'coach_removed') AND details = ${oldId}`);
    }
  });
  console.log("\nDone. Applied in a single transaction.");
  console.log("Next: switch Vercel to the production Clerk keys, redeploy, and have coaches accept their production invites.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
