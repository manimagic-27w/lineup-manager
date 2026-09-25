/**
 * One-time import from the old multi-tenant Google Sheets/Apps Script app into this app's
 * Postgres database. Reads the Hub Sheet (Admins/Teams/Coaches tabs) and every team's own
 * Sheet (App Roster / Activity / "GD <name>" game tabs / optional Stats tab), and writes
 * teams, players, games, availability, lineups, stat categories + values, and activity log
 * entries scoped to one Clerk organization (club).
 *
 * Usage:
 *   1. Create a Google Cloud service account, enable the Sheets API, download its JSON key.
 *   2. Share the Hub Sheet AND every team Sheet with that service account's email (Viewer).
 *   3. Fill in .env.local: GOOGLE_SERVICE_ACCOUNT_JSON, SHEETS_HUB_SPREADSHEET_ID,
 *      IMPORT_TARGET_ORG_ID (the Clerk organization id new data should belong to),
 *      IMPORT_TARGET_ADMIN_USER_ID (a Clerk user id to record as the "creator"/"actor" of
 *      every imported row - use whichever admin is running the import).
 *   4. npm run import:sheets
 *
 * Safe to re-run: it always creates NEW teams (it does not try to match/merge into existing
 * ones), so run it once per club, or point IMPORT_TARGET_ORG_ID at a fresh/empty org first if
 * you want to try it out before doing the real thing.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
loadEnv({ path: existsSync(".env.local") ? ".env.local" : ".env" });

import { google, sheets_v4 } from "googleapis";
import { createClerkClient } from "@clerk/backend";
import { db } from "../src/lib/db";
import {
  teams,
  players,
  games,
  gamePlayers,
  lineupSlots,
  statCategories,
  statValues,
  activityLog,
  teamCoaches,
  SLOTS,
} from "../src/lib/db/schema";

const REQUIRED_ENV = [
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "SHEETS_HUB_SPREADSHEET_ID",
  "IMPORT_TARGET_ORG_ID",
  "IMPORT_TARGET_ADMIN_USER_ID",
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var ${key}. Fill in .env.local (see .env.example) and try again.`);
    process.exit(1);
  }
}

const ORG_ID = process.env.IMPORT_TARGET_ORG_ID!;
const ACTOR_USER_ID = process.env.IMPORT_TARGET_ADMIN_USER_ID!;
const HUB_ID = process.env.SHEETS_HUB_SPREADSHEET_ID!;

const THEME_MAP: Record<string, string> = {
  green: "green",
  navy: "navy",
  orange: "gold",
  black: "black",
  purple: "purple",
  red: "maroon",
  teal: "green",
};

const clerk = process.env.CLERK_SECRET_KEY ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }) : null;

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("Reading Hub Sheet…");
  const hubTeams = await readRows(sheets, HUB_ID, "Teams!A2:F");
  const hubCoaches = await readRows(sheets, HUB_ID, "Coaches!A2:C");

  if (hubTeams.length === 0) {
    console.log("No teams found in the Hub's Teams tab - nothing to import.");
    return;
  }

  // Resolve coach emails -> Clerk user ids once, for the whole club (best-effort).
  const coachUserIdByEmail = new Map<string, string>();
  if (clerk) {
    try {
      const { data: memberships } = await clerk.organizations.getOrganizationMembershipList({
        organizationId: ORG_ID,
        limit: 200,
      });
      for (const m of memberships) {
        const email = m.publicUserData?.identifier?.toLowerCase();
        const userId = m.publicUserData?.userId;
        if (email && userId) coachUserIdByEmail.set(email, userId);
      }
    } catch (err) {
      console.warn("Could not list club members from Clerk - coach assignments will be skipped:", (err as Error).message);
    }
  } else {
    console.warn("CLERK_SECRET_KEY not set - skipping coach assignment (you can add coaches manually afterward).");
  }

  for (const row of hubTeams) {
    const [key, name, color, ssid] = row;
    if (!name || !ssid) continue;
    console.log(`\n=== Team: ${name} ===`);
    await importTeam(sheets, { key, name, color, ssid, coachRows: hubCoaches.filter((c) => c[1] === key), coachUserIdByEmail });
  }

  console.log("\nDone.");
}

async function importTeam(
  sheets: sheets_v4.Sheets,
  opts: { key: string; name: string; color: string; ssid: string; coachRows: string[][]; coachUserIdByEmail: Map<string, string> }
) {
  const [team] = await db
    .insert(teams)
    .values({
      orgId: ORG_ID,
      name: opts.name,
      theme: THEME_MAP[opts.color] ?? "green",
      createdBy: ACTOR_USER_ID,
    })
    .returning();

  // Coaches
  let assigned = 0;
  for (const [email] of opts.coachRows) {
    const userId = opts.coachUserIdByEmail.get((email ?? "").toLowerCase());
    if (!userId) continue;
    await db.insert(teamCoaches).values({ teamId: team.id, userId, addedBy: ACTOR_USER_ID }).onConflictDoNothing();
    assigned++;
  }
  console.log(`  Coaches assigned: ${assigned}/${opts.coachRows.length}`);

  // Roster
  const rosterRows = await readRows(sheets, opts.ssid, "'App Roster'!A2:F");
  const playerIdMap = new Map<string, string>(); // old sheet ID -> new UUID
  const insertedPlayers: { id: string; name: string; number: string; grade: string; experience: string; position: string }[] = [];
  for (const [oldId, name, number, grade, experience, position] of rosterRows) {
    if (!name) continue;
    const [p] = await db
      .insert(players)
      .values({
        teamId: team.id,
        name,
        number: number || null,
        grade: grade || null,
        experience: experience || null,
        position: position || null,
      })
      .returning();
    if (oldId) playerIdMap.set(oldId, p.id);
    insertedPlayers.push({ id: p.id, name, number, grade, experience, position });
  }
  console.log(`  Players: ${insertedPlayers.length}`);

  // Game tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: opts.ssid });
  const gameTabs = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter((title) => title.startsWith("GD "));

  let gameCount = 0;
  let lineupCount = 0;
  for (const tabName of gameTabs) {
    const marker = await readRows(sheets, opts.ssid, `'${tabName}'!A1:B4`);
    if (marker[0]?.[0] !== "GAMEDAY") continue; // not actually a game tab (name coincidence)
    const date = normalizeDate(marker[1]?.[1] ?? "");
    const opponent = marker[2]?.[1] ?? "";
    const notes = marker[3]?.[1] ?? "";
    if (!date) continue;

    const [game] = await db
      .insert(games)
      .values({ teamId: team.id, date, opponent: opponent || null, notes, createdBy: ACTOR_USER_ID })
      .returning();
    gameCount++;

    // Availability + roster snapshot: columns F:L starting row 7.
    const availRows = await readRows(sheets, opts.ssid, `'${tabName}'!F7:L1000`);
    for (const [oldId, , , , , , status] of availRows) {
      const newId = oldId ? playerIdMap.get(oldId) : undefined;
      if (!newId) continue;
      await db
        .insert(gamePlayers)
        .values({ gameId: game.id, playerId: newId, status: normalizeStatus(status) })
        .onConflictDoNothing();
    }

    // Lineup: columns A:D starting row 7, one row per SLOTS entry, in the same order.
    const lineupRows = await readRows(sheets, opts.ssid, `'${tabName}'!A7:D18`);
    for (let i = 0; i < lineupRows.length && i < SLOTS.length; i++) {
      const [slotKey, , oldPlayerId] = lineupRows[i];
      const newPlayerId = oldPlayerId ? playerIdMap.get(oldPlayerId) : undefined;
      if (!newPlayerId || !slotKey) continue;
      await db.insert(lineupSlots).values({ gameId: game.id, slotKey, playerId: newPlayerId }).onConflictDoNothing();
      lineupCount++;
    }
  }
  console.log(`  Games: ${gameCount} (lineup slots filled: ${lineupCount})`);

  // Optional Stats tab
  await importStats(sheets, opts.ssid, team.id, playerIdMap, gameTabs);

  // Activity log (best effort - the old log has no stable player/game ids to remap, so this
  // is imported as free-text history rather than structured rows).
  const activityRows = await readRows(sheets, opts.ssid, "Activity!A2:D2000");
  let activityCount = 0;
  for (const [time, coach, action, details] of activityRows) {
    if (!action) continue;
    await db.insert(activityLog).values({
      teamId: team.id,
      actorUserId: ACTOR_USER_ID,
      action: "imported_from_sheets",
      details: `${time} · ${coach} · ${action}${details ? ` · ${details}` : ""}`,
    });
    activityCount++;
  }
  console.log(`  Activity entries imported: ${activityCount}`);
}

async function importStats(
  sheets: sheets_v4.Sheets,
  ssid: string,
  teamId: string,
  playerIdMap: Map<string, string>,
  gameTabs: string[]
) {
  const headerCell = await readRows(sheets, ssid, "Stats!A1:B1");
  const categoriesRaw = headerCell[0]?.[1] ?? "";
  if (!categoriesRaw) return; // no Stats tab, or it has no categories yet

  let categories: { key: string; label: string }[];
  try {
    categories = JSON.parse(categoriesRaw);
    if (!Array.isArray(categories) || categories.length === 0) return;
  } catch {
    return;
  }

  const categoryIdByKey = new Map<string, string>();
  for (let i = 0; i < categories.length; i++) {
    const [cat] = await db
      .insert(statCategories)
      .values({ teamId, key: categories[i].key, label: categories[i].label, sortOrder: i })
      .returning();
    categoryIdByKey.set(categories[i].key, cat.id);
  }

  // Row 1 from column D onward: each game's block starts with its sheet name, repeated every
  // `categories.length` columns. Row 3+ holds data: col A = old player id, col D onward = one
  // value per category per game block (STATS_FIRST_COL = column D = row index 3, 0-based).
  const header = await readRows(sheets, ssid, "Stats!D1:ZZ1");
  const markers = header[0] ?? [];
  const blocks: { tabName: string; startCol: number }[] = [];
  for (let c = 0; c < markers.length; c += categories.length) {
    if (markers[c] && gameTabs.includes(markers[c])) blocks.push({ tabName: markers[c], startCol: c });
  }
  if (blocks.length === 0) return;

  // Resolve each block's tab to the game we already inserted for it (by date, which is unique
  // per team here since each game tab holds one game).
  const gameIdByTab = new Map<string, string>();
  for (const block of blocks) {
    const dateCell = await readRows(sheets, ssid, `'${block.tabName}'!B2:B2`);
    const date = normalizeDate(dateCell[0]?.[0] ?? "");
    if (!date) continue;
    const existingGame = await db.query.games.findFirst({
      where: (g, { and, eq }) => and(eq(g.teamId, teamId), eq(g.date, date)),
    });
    if (existingGame) gameIdByTab.set(block.tabName, existingGame.id);
  }

  const dataRows = await readRows(sheets, ssid, "Stats!A3:ZZ2000");
  let valueCount = 0;
  for (const row of dataRows) {
    const oldPlayerId = row[0];
    const newPlayerId = oldPlayerId ? playerIdMap.get(oldPlayerId) : undefined;
    if (!newPlayerId) continue;

    for (const block of blocks) {
      const gameId = gameIdByTab.get(block.tabName);
      if (!gameId) continue;

      for (let k = 0; k < categories.length; k++) {
        const cell = row[3 + block.startCol + k]; // column D = row index 3
        if (cell === undefined || cell === null || cell === "") continue;
        const categoryId = categoryIdByKey.get(categories[k].key);
        if (!categoryId) continue;
        await db
          .insert(statValues)
          .values({ gameId, playerId: newPlayerId, categoryId, value: String(cell), updatedBy: ACTOR_USER_ID })
          .onConflictDoNothing();
        valueCount++;
      }
    }
  }
  console.log(`  Stat categories: ${categories.length}, values imported: ${valueCount}`);
}

async function readRows(sheets: sheets_v4.Sheets, spreadsheetId: string, range: string): Promise<string[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return (res.data.values ?? []).map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
  } catch (err) {
    console.warn(`  Could not read ${spreadsheetId} ${range}: ${(err as Error).message}`);
    return [];
  }
}

function normalizeDate(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (m) return m[1];
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const VALID_STATUSES = new Set(["Available", "Not Available", "Maybe", "No Response"]);
function normalizeStatus(v: string): string {
  return VALID_STATUSES.has(v) ? v : "No Response";
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
