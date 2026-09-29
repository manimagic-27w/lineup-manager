import { NextRequest, NextResponse } from "next/server";
import { checkTeamAccess } from "@/lib/auth";
import { authorizePusherChannel } from "@/lib/pusher-server";

// Only private-team-<teamId> channels exist in this app (see teamChannel in @/lib/realtime) -
// anything else is rejected outright rather than trying to authorize it.
const TEAM_CHANNEL_RE = /^private-team-(.+)$/;

/**
 * Pusher's channel-authorization endpoint, wired up via channelAuthorization in
 * @/lib/pusher-client. Every time a client tries to subscribe to a private-* channel, pusher-js
 * POSTs the socket id and channel name here; we only hand back a signed authorization if the
 * caller can actually see that team - the exact same requireTeamAccess check every Server
 * Action runs, just via checkTeamAccess so a failure is a plain 403 instead of a redirect.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const socketId = form.get("socket_id");
  const channelName = form.get("channel_name");
  if (typeof socketId !== "string" || typeof channelName !== "string") {
    return NextResponse.json({ error: "Missing socket_id or channel_name" }, { status: 400 });
  }

  const match = TEAM_CHANNEL_RE.exec(channelName);
  if (!match) {
    return NextResponse.json({ error: "Unrecognized channel" }, { status: 403 });
  }
  const teamId = match[1];

  const access = await checkTeamAccess(teamId);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const authResponse = authorizePusherChannel(socketId, channelName);
  if (!authResponse) {
    // Pusher isn't configured - shouldn't come up in practice, since the client never attempts
    // a subscription without a key/cluster either, but fail closed rather than 500 either way.
    return NextResponse.json({ error: "Realtime not configured" }, { status: 503 });
  }

  return NextResponse.json(authResponse);
}
