"use client";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * A small per-row indicator for a save that fires immediately on change (availability status,
 * a lineup slot) rather than behind an explicit Save button - see LineupBoard and
 * AvailabilityList. "idle" renders an invisible placeholder the same width as the others so
 * rows don't shift as a save starts/finishes. "error" is the one state that doesn't clear
 * itself - it's a button, and stays there until the coach retries (or picks something else,
 * which starts a fresh save attempt) so a failed save is never silently lost.
 */
export function SaveStatusIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "saving") {
    return (
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brand-blue"
        title="Saving…"
        aria-label="Saving"
        role="status"
      />
    );
  }

  if (status === "saved") {
    return (
      <span className="shrink-0 text-sm font-medium text-emerald-600" title="Saved" aria-label="Saved" role="status">
        ✓
      </span>
    );
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-200"
        title="Didn't save - tap to retry"
      >
        Retry
      </button>
    );
  }

  return <span className="inline-block h-2.5 w-2.5 shrink-0" aria-hidden />;
}
