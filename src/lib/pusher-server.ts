import "server-only";
import PusherServer from "pusher";
import { teamChannel, TEAM_UPDATED_EVENT, type TeamUpdateScope } from "./realtime";

let cached: PusherServer | null | undefined;

/** Returns null (rather than throwing) when Pusher env vars aren't set, so the app still
 *  works locally without real-time configured - screens just fall back to manual refresh. */
function getPusherServer(): PusherServer | null {
  if (cached !== undefined) return cached;

  const { PUSHER_APP_ID, NEXT_PUBLIC_PUSHER_KEY, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_CLUSTER } =
    process.env;

  if (!PUSHER_APP_ID || !NEXT_PUBLIC_PUSHER_KEY || !PUSHER_SECRET || !NEXT_PUBLIC_PUSHER_CLUSTER) {
    cached = null;
    return cached;
  }

  cached = new PusherServer({
    appId: PUSHER_APP_ID,
    key: NEXT_PUBLIC_PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true,
  });
  return cached;
}

/**
 * Answers a Pusher channel-authorization request for a `private-team-<teamId>` channel (see
 * src/app/api/pusher/auth/route.ts, the only caller - that route has already run the same
 * team-access check every Server Action uses before calling this). Returns null when Pusher
 * isn't configured, which the route treats as "realtime unavailable" rather than "forbidden."
 */
export function authorizePusherChannel(socketId: string, channel: string) {
  const pusher = getPusherServer();
  if (!pusher) return null;
  return pusher.authorizeChannel(socketId, channel);
}

/** Call after committing any write in a server action. Never throws - a broadcast failure
 *  should never fail the mutation that triggered it. */
export async function broadcastTeamUpdate(teamId: string, scope: TeamUpdateScope, gameId?: string) {
  const pusher = getPusherServer();
  if (!pusher) return;
  try {
    await pusher.trigger(teamChannel(teamId), TEAM_UPDATED_EVENT, {
      scope,
      gameId,
      at: Date.now(),
    });
  } catch (err) {
    console.error("Pusher broadcast failed:", err);
  }
}
