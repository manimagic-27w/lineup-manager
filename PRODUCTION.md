# Moving to production (lacrosselineupmanager.com)

The database and all data (teams, rosters, games, lineups, stats, activity) stay where they are.
What changes is Clerk: the dev instance becomes a production instance, and the club / coach ids
stored in the database are rewritten to their production equivalents by
`scripts/migrate-clerk-ids.ts`.

## 0. Before anything: back up
- Neon console -> your project -> Branches -> **Create branch** from the main branch, name it
  `pre-production-backup`. Instant and free; restore from it if anything goes wrong.
- Also download the Excel export for each team (Team -> Export).

## 1. Domain + Vercel
- The domain was bought through Vercel, so Vercel is also the DNS host: no registrar changes.
  Vercel project -> Settings -> Domains -> add `lacrosselineupmanager.com` (and `www`, set to
  redirect to the main one). Vercel configures its own records automatically.
- Set `NEXT_PUBLIC_APP_URL=https://lacrosselineupmanager.com` in Vercel (Production).

## 2. Create the Clerk production instance
- Clerk dashboard -> instance switcher (top left) -> **Create production instance**; clone dev
  settings. Domain: `lacrosselineupmanager.com`.
- Add the DNS records Clerk lists (Domains page; usually 5 CNAMEs incl. email) in Vercel:
  Vercel dashboard -> Domains -> `lacrosselineupmanager.com` -> DNS Records -> Add. Use the
  names Clerk shows (e.g. `clerk`, `accounts`, the mail ones) as the record names, type CNAME,
  and Clerk's targets as the values. Then back in Clerk: Verify, then **Deploy certificates**.
- Enable **Organizations**. Under Restrictions, make sign-up invite-only (or restricted).
- If you offer Google sign-in, create your own Google OAuth credentials and enter them in Clerk.
- Recreate Paths / branding / sign-out redirect (Clerk doesn't copy them).

## 3. Recreate the club(s) in production
- Create each club in the production instance with **exactly the same name** as in dev
  (the migration matches clubs by name).
- Sign up yourself with the same email, and make yourself `org:admin` in the club.
- Invite each coach from the production Admin page (same emails as before). No need to assign
  teams yet.

## 4. Remap the data (run on your computer)
```bash
# Preview - changes nothing
OLD_CLERK_SECRET_KEY=sk_test_xxx NEW_CLERK_SECRET_KEY=sk_live_xxx npm run migrate:clerk-ids

# When the preview looks right
OLD_CLERK_SECRET_KEY=sk_test_xxx NEW_CLERK_SECRET_KEY=sk_live_xxx npm run migrate:clerk-ids -- --apply
```
- Clubs matched by name; people matched by email.
- People already signed up in production keep their team assignments. People who haven't yet
  become pending assignments by email and attach automatically once they join the club and an
  admin opens the Admin page.
- It runs in one transaction, and it's safe to re-run (e.g. after more coaches sign up).

## 5. Switch the app over
- Vercel (Production env vars): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...`,
  `CLERK_SECRET_KEY=sk_live_...`. Keep the same `DATABASE_URL`. Redeploy.
- Keep `pk_test` / `sk_test` only in Preview/Development.
- For local development, create a Neon branch of production and put its connection string in
  `.env.local` so local work and `db:push` never touch real data.

## 6. Check
- Sign in at lacrosselineupmanager.com as admin: teams, rosters, games, lineups all present.
- Sign in as a coach: only their assigned teams show.
- Activity page names resolve for everyone who has signed up in production.
- Tell coaches their old dev login stops working; they use the production invite.

Order matters: do step 4 **before** step 5 (or within minutes of it), so there's no window where
the live app is on production keys but the data still points at dev ids.

## Game film storage (Cloudflare R2)
Coaches upload a whole game (about 2 GB); the browser cuts it into ~200 MB clips and sends each one
straight to an R2 bucket. Clips can be downloaded for 24 hours and are then erased. One-time setup:

1. Cloudflare dashboard -> R2 -> **Create bucket** (e.g. `lineup-film`). Keep it private.
2. Bucket -> Settings -> **CORS policy** -> add:
   `[{"AllowedOrigins":["https://lacrosselineupmanager.com","http://localhost:3000"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["content-type"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]`
3. Bucket -> Settings -> **Object lifecycle rules** -> add a rule: delete objects 1 day after upload
   (a safety net; the app itself erases film at 24 hours).
4. R2 -> **Manage API tokens** -> create a token with *Object Read & Write* limited to that bucket.
   Note the Account ID, Access Key ID and Secret Access Key.
5. Vercel (Production env vars; also `.env.local` for local testing):
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `CRON_SECRET`
   (any long random string - Vercel sends it to the daily cleanup job in `vercel.json`). Redeploy.
6. Run `npm run db:push` for the `game_films` / `game_film_parts` tables.

Until step 5 is done, the game page shows "Film upload isn't set up for this app yet."
