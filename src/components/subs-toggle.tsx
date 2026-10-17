"use client";

import { useState, useTransition } from "react";
import { setGameSubs } from "@/actions/games";
import { cn } from "@/lib/utils";

/**
 * The "Subs" switch under the Lineup heading: turns the extra sub spots (2 attack, 3 midfield,
 * 2 defense) on or off for this game. The switch flips right away and goes back if the save fails.
 */
export function SubsToggle({
  teamId,
  gameId,
  initialOn,
}: {
  teamId: string;
  gameId: string;
  initialOn: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setError(false);
    startTransition(async () => {
      try {
        await setGameSubs(teamId, gameId, next);
      } catch {
        setOn(!next);
        setError(true);
      }
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Subs"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 disabled:opacity-70",
          on ? "bg-brand-blue" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            on ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="text-sm text-slate-700">
        <span className="font-medium">Subs</span>
        <span className="text-slate-500"> &ndash; 2 attack, 3 midfield, 2 defense</span>
      </span>
      {error && <span className="text-xs text-red-600">Couldn&rsquo;t save - try again.</span>}
    </div>
  );
}
