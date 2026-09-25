"use client";

import { useEffect, useRef } from "react";
import PusherClient from "pusher-js";
import { teamChannel, TEAM_UPDATED_EVENT, type TeamUpdatePayload } from "./realtime";

let client: PusherClient | null | undefined;

function getPusherClient(): PusherClient | null {
  if (client !== undefined) return client;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) {
    client = null;
    return client;
  }
  client = new PusherClient(key, { cluster });
  return client;
}

/**
 * Subscribes to a team's real-time channel for the lifetime of the calling component and
 * invokes `onUpdate` for every event. Pass a stable `onUpdate` (e.g. one that closes over
 * `router.refresh`) - the effect only re-subscribes when `teamId` changes. If Pusher isn't
 * configured (no env vars) this is a silent no-op, so the app degrades to manual refresh.
 */
export function useTeamRealtime(teamId: string, onUpdate: (payload: TeamUpdatePayload) => void) {
  const handlerRef = useRef(onUpdate);
  useEffect(() => {
    handlerRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe(teamChannel(teamId));
    const handler = (payload: TeamUpdatePayload) => handlerRef.current(payload);
    channel.bind(TEAM_UPDATED_EVENT, handler);

    return () => {
      channel.unbind(TEAM_UPDATED_EVENT, handler);
      pusher.unsubscribe(teamChannel(teamId));
    };
  }, [teamId]);
}
