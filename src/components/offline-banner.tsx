"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { readGameDaySnapshot } from "@/lib/game-day-cache";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return !navigator.onLine;
}

// The server has no network state of its own - assume online so the very first (server-
// rendered) paint never shows the banner. useSyncExternalStore re-checks the real value the
// moment this hydrates on the client, so a page opened while already offline still catches up
// almost immediately rather than staying wrong.
function getServerSnapshot() {
  return false;
}

/**
 * A persistent banner for the game-day page (see [gameId]/page.tsx) that tells the coach
 * outright when their browser thinks it's offline, rather than leaving them looking at a
 * screen that's silently gone stale - the save-retry indicators on the lineup board and
 * availability list already surface an individual failed save, but nothing previously said
 * "you're offline" up front.
 */
export function OfflineBanner({ gameId }: { gameId: string }) {
  const isOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const router = useRouter();

  // Refresh the moment the browser reports being back online, to pick up anything missed
  // (both local saves and other coaches' changes) while the connection was down. Kept as its
  // own effect, separate from the isOffline subscription above, since it only ever needs to
  // fire the one imperative action rather than hold any state of its own.
  useEffect(() => {
    function handleOnline() {
      router.refresh();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [router]);

  if (!isOffline) return null;

  const snapshot = readGameDaySnapshot(gameId);
  const lastSynced = snapshot
    ? new Date(snapshot.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      You&rsquo;re offline{lastSynced ? ` - last synced ${lastSynced}` : ""}. Changes won&rsquo;t save until
      you&rsquo;re back online - they&rsquo;ll show as failed with a Retry button below, so nothing saves
      silently.
    </div>
  );
}
