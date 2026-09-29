/**
 * Shared, environment-agnostic real-time constants. Safe to import from both server code
 * (src/lib/pusher-server.ts) and client components (src/lib/pusher-client.ts) - it has no
 * dependency on either the `pusher` (Node) or `pusher-js` (browser) packages itself.
 *
 * One Pusher channel per team. Every server action that mutates a team's data broadcasts a
 * single lightweight "something in this scope changed" event; listening screens simply
 * `router.refresh()` to re-pull server data rather than trying to merge partial payloads.
 *
 * The `private-` prefix is load-bearing, not decorative: Pusher only asks the app to authorize
 * a subscription for channels named `private-*` (or `presence-*`). Without it, anyone who has
 * or guesses a team's id can open a WebSocket straight to Pusher and listen in - no app
 * involved at all. See src/app/api/pusher/auth/route.ts for the authorization check, which
 * reuses the exact same access rule every Server Action already applies.
 */
export function teamChannel(teamId: string) {
  return `private-team-${teamId}`;
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
