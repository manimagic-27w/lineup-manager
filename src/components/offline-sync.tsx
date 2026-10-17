"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getOfflineSnapshot } from "@/actions/offline";
import { saveTeamSnapshot } from "@/lib/offline-storage";

const MIN_GAP_MS = 20_000; // don't re-save more often than this
const REFRESH_MS = 5 * 60_000; // while the app is open and visible

/**
 * Keeps an offline copy of this team's game-day info on the phone: saved when a team page opens,
 * after moving between pages, when the connection comes back, and every few minutes. It is
 * best-effort and silent on failure - with no signal the copy just stays as it was.
 */
export function OfflineSync({ teamId }: { teamId: string }) {
  const { userId } = useAuth();
  const pathname = usePathname();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRun = useRef(0);

  const sync = useCallback(
    async (force = false) => {
      if (!userId || !navigator.onLine) return;
      if (!force && Date.now() - lastRun.current < MIN_GAP_MS) return;
      lastRun.current = Date.now();
      setBusy(true);
      try {
        const snapshot = await getOfflineSnapshot(teamId);
        if (saveTeamSnapshot(userId, snapshot)) setSavedAt(new Date(snapshot.savedAt));
      } catch {
        /* offline or signal too weak - keep the previous copy */
      } finally {
        setBusy(false);
      }
    },
    [teamId, userId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => sync(), 0);
    return () => window.clearTimeout(timer);
  }, [sync, pathname]);

  useEffect(() => {
    const onOnline = () => sync(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") sync(true);
    }, REFRESH_MS);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  return (
    <p className="pb-2 text-xs text-slate-400 print:hidden">
      {savedAt
        ? `Offline copy saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : busy
          ? "Saving offline copy…"
          : "Offline copy not saved yet"}
      {" · "}
      <button type="button" onClick={() => sync(true)} disabled={busy} className="underline hover:text-brand-blue disabled:opacity-60">
        {busy ? "Saving…" : "Save now"}
      </button>
    </p>
  );
}
