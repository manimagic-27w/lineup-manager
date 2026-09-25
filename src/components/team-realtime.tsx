"use client";

import { useRouter } from "next/navigation";
import { useTeamRealtime } from "@/lib/pusher-client";
import type { TeamUpdateScope } from "@/lib/realtime";

/**
 * Drop this into any team-scoped screen. When another coach's action broadcasts a change for
 * one of `scopes` (or `scopes` is omitted, meaning "any change"), this refetches the current
 * route's server data via `router.refresh()` - no client state to reconcile, no polling.
 */
export function TeamRealtime({ teamId, scopes }: { teamId: string; scopes?: TeamUpdateScope[] }) {
  const router = useRouter();

  useTeamRealtime(teamId, (payload) => {
    if (!scopes || scopes.includes(payload.scope)) {
      router.refresh();
    }
  });

  return null;
}
