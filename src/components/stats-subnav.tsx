"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Switches between the team roll-up (and player pages) and the game-by-game entry sheet. */
export function StatsSubnav({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  const sheetHref = `/teams/${teamId}/stats/sheet`;
  const logsHref = `/teams/${teamId}/stats/games`;
  const onLogs = pathname.startsWith(logsHref) || pathname.startsWith(`/teams/${teamId}/stats/game/`);
  const onSheet = pathname.startsWith(sheetHref);
  const tabs = [
    { href: `/teams/${teamId}/stats`, label: "Team summary", active: !onLogs && !onSheet },
    { href: logsHref, label: "Game logs", active: onLogs },
    { href: sheetHref, label: "Enter & import stats", active: onSheet },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl gap-2 px-4 pt-6 sm:px-6 print:hidden">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium",
            t.active ? "border-brand-orange bg-brand-orange text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
