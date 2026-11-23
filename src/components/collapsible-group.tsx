"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A tap-to-open section for the parents' pages: shows just the name (and a count) until opened, so long
 *  lists of games and clips don't turn into one endless scroll. Open state is owned by the caller. */
export function CollapsibleGroup({
  title,
  count,
  countLabel,
  open,
  onToggle,
  flush = false,
  children,
}: {
  title: string;
  count: number;
  countLabel: string; // e.g. "game" or "clip" (pluralised here)
  open: boolean;
  onToggle: () => void;
  flush?: boolean; // children bring their own horizontal padding (full-width rows)
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{title}</span>
          <span className="block text-xs text-slate-500">
            {count} {countLabel}
            {count === 1 ? "" : "s"}
          </span>
        </span>
        <span aria-hidden="true" className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-90")}>
          ▶
        </span>
      </button>
      {open && <div className={cn("border-t border-slate-100", !flush && "px-4")}>{children}</div>}
    </div>
  );
}
