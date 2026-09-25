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
