"use client";

import { useTransition } from "react";
import { setParentApprovalRequired } from "@/actions/training-log";

/** Training-tab switch: does this team have parents approve logged time? */
export function ParentApprovalToggle({ teamId, required }: { teamId: string; required: boolean }) {
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    if (!next && !window.confirm("Stop requiring parent approval? Time that is waiting right now will be counted, and new time counts as soon as a player logs it. Players will no longer be asked for phone numbers.")) return;
    startTransition(async () => {
      await setParentApprovalRequired(teamId, next);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-slate-900">
          Parent approval: <span className={required ? "text-green-700" : "text-slate-500"}>{required ? "required" : "not required"}</span>
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {required
            ? "A parent has to approve a player’s logged time before it counts in your totals."
            : "Logged time counts right away. Players aren’t asked for phone numbers and the parent link is hidden."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => change(!required)}
        disabled={pending}
        className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60"
      >
        {pending ? "Saving…" : required ? "Stop requiring approval" : "Require parent approval"}
      </button>
    </div>
  );
}
