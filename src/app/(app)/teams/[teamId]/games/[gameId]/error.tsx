"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { readGameDaySnapshot, type GameDaySnapshot } from "@/lib/game-day-cache";
import { AvailabilityList } from "@/components/availability-list";
import { LineupBoard } from "@/components/lineup-board";
import { formatDate } from "@/lib/utils";

/**
 * Next's route-level error boundary for a single game-day screen: it renders automatically
 * whenever that route fails to load, in place of the normal page. The common cause on this
 * screen is a dropped sideline connection, so rather than a bare error message, this falls
 * back to whatever was cached by GameDayCacheWriter the last time this same game loaded
 * successfully - read-only, clearly labeled as a cached copy, with a Try again button.
 *
 * This only ever has something to show if this browser already loaded this game at least once
 * before the connection dropped - it's not a substitute for a real offline-first rebuild, just
 * the difference between "you see last night's roster and lineup" and "you see nothing at
 * all." A field with zero signal from the moment the app is opened still needs the printed
 * lineup sheet.
 */
export default function GameDayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ teamId: string; gameId: string }>();
  // Lazy initializer, not an effect: this only ever needs to run once, when this boundary
  // mounts for a given error. Guarded for the rare case this renders on the server (no
  // localStorage there) - it just degrades to the plain "couldn't load" fallback with no
  // cached copy to show.
  const [snapshot] = useState<GameDaySnapshot | null>(() =>
    typeof window === "undefined" ? null : readGameDaySnapshot(params.gameId)
  );

  useEffect(() => {
    console.error("Game-day page failed to load:", error);
  }, [error]);

  const lastSynced = snapshot ? new Date(snapshot.savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">
          {snapshot ? "Showing a cached copy - this couldn't load fresh." : "This game couldn't load."}
        </p>
        <p className="mt-1">
          {snapshot
            ? `As of ${lastSynced}. This view is read-only - reconnect and try again to make changes.`
            : "Check your connection and try again."}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
          >
            Try again
          </button>
          <Link
            href={`/teams/${params.teamId}/games`}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Back to games
          </Link>
        </div>
      </div>

      {snapshot && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
          <section>
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              {formatDate(snapshot.date)}
              {snapshot.opponent ? ` vs ${snapshot.opponent}` : ""}
            </h2>
            {snapshot.seasonName && <p className="mb-3 text-xs text-slate-500">{snapshot.seasonName}</p>}
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Lineup</h3>
            <LineupBoard
              teamId={snapshot.teamId}
              gameId={snapshot.gameId}
              slots={snapshot.slots}
              roster={snapshot.roster}
              canEdit={false}
            />
          </section>

          <section className="lg:sticky lg:top-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Availability</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <AvailabilityList
                teamId={snapshot.teamId}
                gameId={snapshot.gameId}
                roster={snapshot.roster}
                canEdit={false}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
