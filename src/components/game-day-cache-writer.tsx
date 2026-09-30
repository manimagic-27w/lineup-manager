"use client";

import { useEffect } from "react";
import { saveGameDaySnapshot, type GameDaySnapshotPlayer, type GameDaySnapshotSlot } from "@/lib/game-day-cache";

/**
 * Invisible - mounted once on the game-day page (see [gameId]/page.tsx) purely to keep
 * localStorage's copy of this game current every time the page successfully renders with live
 * data. See src/lib/game-day-cache.ts for what reads it back (the route's error.tsx, when a
 * later load of this same game fails).
 */
export function GameDayCacheWriter({
  gameId,
  teamId,
  date,
  opponent,
  seasonName,
  format,
  roster,
  slots,
}: {
  gameId: string;
  teamId: string;
  date: string;
  opponent: string | null;
  seasonName: string | null;
  format: string;
  roster: GameDaySnapshotPlayer[];
  slots: GameDaySnapshotSlot[];
}) {
  // Stringifying the arrays keeps this from re-firing on every render when the data hasn't
  // actually changed (the page re-creates these arrays each render) - cheap enough at the size
  // of one roster and 12 lineup slots.
  const rosterKey = JSON.stringify(roster);
  const slotsKey = JSON.stringify(slots);

  useEffect(() => {
    saveGameDaySnapshot({ gameId, teamId, date, opponent, seasonName, format, roster, slots });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, teamId, date, opponent, seasonName, format, rosterKey, slotsKey]);

  return null;
}
