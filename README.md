# Lineup Manager

A multi-club lacrosse team management app: rosters, game-day availability, lineup builder,
stats tracking, activity history, and data export - with real-time updates between coaches.

This is a full rewrite of an earlier Google Sheets/Apps Script version, ported onto:

- **Next.js 16** (App Router) - deploy target: **Vercel**
- **Neon** (serverless Postgres) via **Drizzle ORM**
- **Clerk** for authentication - Clerk **Organizations** map 1:1 to "clubs," which is the
  entire mechanism behind multi-club support
- **Pusher Channels** for real-time updates (a coach's edit shows up for every other coach
  looking at the same team, without a page refresh)
- **exceljs** for data export, **googleapis** for the one-time Sheets import

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run db:push              # creates the schema in your Neon database
npm run dev
```

Open http://localhost:3000. You'll be sent to sign in, then to pick or create a club (a Clerk
Organization) before you see any team data.

### 1. Neon (database)

Create a project at [neon.tech](https://neon.tech), copy its connection string into
`DATABASE_URL` in `.env.local`. Then run `npm run db:push` to create all tables (or
`npm run db:generate` + `npm run db:migrate` if you'd rather manage versioned migration files -
one migration is already checked in at `drizzle/0000_*.sql`).

### 2. Clerk (auth + clubs)

Create an application at [clerk.com](https://clerk.com).

- Turn on **Organizations** (Clerk dashboard → Organizations → Enable). Each Organization is a
  club in this app.
- Copy the publishable/secret keys into `.env.local`.
- Under **Organizations → Roles**, the built-in `org:admin` and `org:member` roles are used
  as-is - `org:admin` is a club admin (can create teams, invite/assign coaches, edit anything
  in the club); `org:member` is a coach who only sees teams they're explicitly assigned to.
- Under **Paths**, set where you want people sent after signing out (the `UserButton`'s
  sign-out redirect is configured there, not in code, in this version of Clerk).

### 3. Pusher (real-time) - optional

Create a free app at [pusher.com](https://pusher.com/channels), fill in the four `PUSHER_*` /
`NEXT_PUBLIC_PUSHER_*` values. If you skip this, the app still works - coaches just need to
refresh to see each other's changes instead of it happening live.

### 4. Deploy to Vercel

Push this repo to GitHub and import it in Vercel, or run `vercel`. Set the same environment
variables from `.env.local` in the Vercel project settings. The Neon serverless driver and
Pusher both work fine from Vercel's Node.js runtime.

## Importing from the old Google Sheets app

If you're migrating an existing club off the Sheets/Apps Script version:

1. Create a Google Cloud service account, enable the Sheets API for it, and download its JSON
   key file.
2. Share the Hub Sheet and every team Sheet with that service account's email (Viewer access
   is enough).
3. Fill in `GOOGLE_SERVICE_ACCOUNT_JSON` (path to the key file), `SHEETS_HUB_SPREADSHEET_ID`,
   `IMPORT_TARGET_ORG_ID` (the Clerk organization/club the data should land in - create it in
   the app first via "select a club"), and `IMPORT_TARGET_ADMIN_USER_ID` (your Clerk user id -
   recorded as the "creator"/"actor" of everything imported).
4. `npm run import:sheets`

It imports teams, rosters, games, availability, lineups, stat categories/values, and activity
history. Coaches are auto-assigned to their teams only if they're already members of the
target club in Clerk and `CLERK_SECRET_KEY` is set (it looks them up by email) - otherwise,
assign them from each team's Settings page afterward. The script only ever creates new teams,
so it's safe to point at a fresh/empty club to try it out first.

## Exporting data

Every team's Settings page has two exports: a quick roster CSV, and a full `.xlsx` workbook
(Roster / Games / Availability / Lineup / Stats as separate sheets) - useful as a backup or for
handing data to someone outside the app.

## How authorization works

There's no local `users` table. Identity and club-level role (`org:admin` vs `org:member`)
live entirely in Clerk. The one thing Clerk doesn't know about - which teams, within a club, a
given coach can see - is the `team_coaches` table (`src/lib/db/schema.ts`). See
`src/lib/auth.ts` for the three checks everything else is built on: `requireOrgSession`,
`requireOrgAdmin`, `requireTeamAccess`.

## How stats blackout works

A player's stat cell for a given game is blacked out (not editable) whenever their
availability for that game is "Not Available" - computed live from `game_players.status` every
time the stats sheet loads, in `getStatSheet` (`src/actions/stats.ts`). It's never stored as a
flag, and changing someone's availability never deletes a stat value already recorded for
them.

## How real-time works

Every server action that changes a team's data calls `broadcastTeamUpdate(teamId, scope)`
(`src/lib/pusher-server.ts`) after committing. Any screen that renders that team includes a
`<TeamRealtime teamId scopes={[...]} />` component (`src/components/team-realtime.tsx`), which
subscribes to that team's Pusher channel and calls `router.refresh()` on a matching event - no
client state to merge, no polling.

## Project structure

```
src/
  app/                     Routes (App Router)
    sign-in/, sign-up/     Clerk auth pages
    select-org/            Pick/create a club
    (app)/                 Authenticated shell (org switcher, admin link, sign-out)
      admin/               Club admin: teams, invites, member list
      teams/[teamId]/      Team-scoped: roster, games, stats, activity, settings
    api/teams/[teamId]/export/   CSV/XLSX export route
  actions/                 Server actions (the mutation layer - one file per feature)
  components/              Client components (forms, tables, realtime listener)
  lib/
    db/schema.ts           Drizzle schema - the source of truth for the data model
    auth.ts                Authorization helpers
    pusher-server.ts / pusher-client.ts / realtime.ts   Real-time plumbing
    csv.ts, export-data.ts CSV parsing/serialization and export data-gathering
scripts/import-from-sheets.ts   One-time Google Sheets migration
```

## Testing

```bash
npm test          # vitest - pure-logic unit tests (CSV parsing, schema shape, utils)
npm run lint       # eslint
npx tsc --noEmit   # typecheck
npm run build      # full production build
```

The unit tests deliberately cover logic that doesn't need a database (CSV parsing, the fixed
12-slot lineup layout, default stat categories). The server actions and routes are thin wrappers
around Drizzle queries and are best exercised against a real (or locally-run) Postgres/Neon
branch - there's no seed script yet, but `npm run db:push` against an empty Neon branch plus
manually clicking through "create a club → create a team → add players → schedule a game" is a
quick way to smoke-test end to end.

## Known gaps / next steps

- The lineup builder uses `<select>` dropdowns per slot rather than drag-and-drop.
  `@dnd-kit` is already a dependency if you want to upgrade that later.
- Coach invitations are club-wide (Clerk org invites); assigning an invited coach to a specific
  team is a separate manual step on that team's Settings page once they've accepted.
- There's no email/webhook-driven sync when someone accepts a Clerk invite - the admin UI reads
  membership live from Clerk on each page load instead.
