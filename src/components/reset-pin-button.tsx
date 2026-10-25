"use client";

import { useTransition } from "react";
import { resetPlayerPin } from "@/actions/training-log";

export function ResetPinButton({ teamId, playerId, playerName }: { teamId: string; playerId: string; playerName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Reset ${playerName}'s PIN? They'll pick a new one next time they open the log.`)) return;
        startTransition(async () => {
          try {
            await resetPlayerPin(teamId, playerId);
          } catch {
            window.alert("Couldn't reset the PIN - try again.");
          }
        });
      }}
      className="font-medium text-brand-blue hover:underline disabled:opacity-60"
    >
      {pending ? "Resetting…" : "Reset PIN"}
    </button>
  );
}
