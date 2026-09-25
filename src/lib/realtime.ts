/**
 * Shared, environment-agnostic real-time constants. Safe to import from both server code
 * (src/lib/pusher-server.ts) and client components (src/lib/pusher-client.ts) - it has no
 * dependency on either the `pusher` (Node) or `pusher-js` (browser) packages itself.
 *
 * One Pusher channel per team. Every server action that mutates a team's data broadcasts a
 * single lightweight "something in this scope changed" event; listening screens simply
 * `router.refresh()` to re-pull server data rather than trying to merge partial payloads.
 */
export function teamChannel(teamId: string) {
  return `team-${teamId}`;
}

export const TEAM_UPDATED_EVENT = "team-updated";

export type TeamUpdateScope =
  | "roster"
  | "games"
  | "availability"
  | "lineup"
  | "stats"
  | "activity"
  | "coaches";

export interface TeamUpdatePayload {
  scope: TeamUpdateScope;
  gameId?: string;
  at: number;
}
