"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function TeamNav({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/teams/${teamId}/roster`, label: "Roster" },
    { href: `/teams/${teamId}/games`, label: "Games" },
    { href: `/teams/${teamId}/stats`, label: "Stats" },
    { href: `/teams/${teamId}/activity`, label: "Activity" },
    { href: `/teams/${teamId}/settings`, label: "Settings" },
  ];

  return (
    <nav className="mt-3 flex gap-5 overflow-x-auto text-sm">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "whitespace-nowrap border-b-2 pb-2 font-medium",
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
