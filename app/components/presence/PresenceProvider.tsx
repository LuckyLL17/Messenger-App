"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";

import { pusherClient, pusherConfigured } from "@/app/libs/pusher";
import {
  HEARTBEAT_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  PRESENCE_CHANNEL,
  PRESENCE_UPDATE_EVENT,
  PresenceSnapshotEntry,
  PresenceStatus,
} from "@/app/libs/presence";
import { PresenceContext, PresenceMap } from "@/app/hooks/usePresence";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
] as const;

// Snapshot refetch interval used only when Pusher isn't configured,
// so presence still converges without websockets.
const FALLBACK_POLL_INTERVAL_MS = 30_000;

interface PresenceProviderProps {
  children: React.ReactNode;
}

export default function PresenceProvider({ children }: PresenceProviderProps) {
  const { status } = useSession();
  const [presenceMap, setPresenceMap] = useState<PresenceMap>({});

  // One id per tab: each tab/device heartbeats independently and the user
  // only goes offline once every device has stopped.
  const deviceIdRef = useRef<string | null>(null);
  // Initialized to 0 and set to Date.now() when the effect starts.
  const lastActivityRef = useRef<number>(0);
  const lastReportedStateRef = useRef<"active" | "away">("active");

  const refreshSnapshot = useCallback(() => {
    axios
      .get<PresenceSnapshotEntry[]>("/api/presence")
      .then(({ data }) => {
        // Replace (not merge) so entries missing from the snapshot —
        // i.e. users the server now considers offline — are dropped.
        const next: PresenceMap = {};
        for (const entry of data) {
          next[entry.email] = {
            status: entry.status,
            lastSeenAt: entry.lastSeenAt,
          };
        }
        setPresenceMap(next);
      })
      .catch(() => {});
  }, []);

  const sendHeartbeat = useCallback(() => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) {
      return;
    }

    const isIdle = Date.now() - lastActivityRef.current > IDLE_TIMEOUT_MS;
    const state = isIdle || document.hidden ? "away" : "active";
    lastReportedStateRef.current = state;

    axios.post("/api/presence/heartbeat", { deviceId, state }).catch(() => {});
  }, []);

  const sendOfflineBeacon = useCallback(() => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) {
      return;
    }

    const payload = JSON.stringify({ deviceId });
    navigator.sendBeacon(
      "/api/presence/offline",
      new Blob([payload], { type: "application/json" }),
    );
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    if (!deviceIdRef.current) {
      deviceIdRef.current = window.crypto.randomUUID();
    }

    lastActivityRef.current = Date.now();

    // Throttled activity tracking: record activity at most once per second,
    // and ping immediately when the user comes back from "away".
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < 1000) {
        return;
      }
      lastActivityRef.current = now;

      if (lastReportedStateRef.current === "away" && !document.hidden) {
        sendHeartbeat();
      }
    };

    const handleVisibilityChange = () => {
      // Hidden tabs report "away"; becoming visible again reports "active"
      // and re-syncs in case events were missed while backgrounded.
      sendHeartbeat();
      if (!document.hidden) {
        lastActivityRef.current = Date.now();
        refreshSnapshot();
      }
    };

    const handleFocusOrOnline = () => {
      lastActivityRef.current = Date.now();
      sendHeartbeat();
      refreshSnapshot();
    };

    const handlePageHide = () => {
      sendOfflineBeacon();
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, handleActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocusOrOnline);
    window.addEventListener("online", handleFocusOrOnline);
    window.addEventListener("pagehide", handlePageHide);

    // Initial heartbeat + snapshot, then the recurring heartbeat loop.
    sendHeartbeat();
    refreshSnapshot();
    const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Realtime updates for other users' transitions.
    const channel = pusherClient.subscribe(PRESENCE_CHANNEL);
    const updateHandler = (data: {
      email: string;
      status: PresenceStatus;
      lastSeenAt: string | null;
    }) => {
      setPresenceMap((current) => ({
        ...current,
        [data.email]: { status: data.status, lastSeenAt: data.lastSeenAt },
      }));
    };
    channel.bind(PRESENCE_UPDATE_EVENT, updateHandler);

    // After a dropped websocket reconnects, events may have been missed —
    // pull a fresh snapshot so the local view converges with the server.
    const handleReconnect = () => {
      sendHeartbeat();
      refreshSnapshot();
    };
    pusherClient.connection?.bind?.("connected", handleReconnect);

    // Without websockets, poll lightly to stay converged.
    const pollTimer = pusherConfigured
      ? null
      : setInterval(refreshSnapshot, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      clearInterval(heartbeatTimer);
      if (pollTimer) {
        clearInterval(pollTimer);
      }

      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, handleActivity),
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocusOrOnline);
      window.removeEventListener("online", handleFocusOrOnline);
      window.removeEventListener("pagehide", handlePageHide);

      channel.unbind(PRESENCE_UPDATE_EVENT, updateHandler);
      pusherClient.connection?.unbind?.("connected", handleReconnect);
      pusherClient.unsubscribe(PRESENCE_CHANNEL);

      // Covers sign-out (the provider unmounts when the session ends).
      sendOfflineBeacon();
    };
  }, [status, sendHeartbeat, refreshSnapshot, sendOfflineBeacon]);

  return (
    <PresenceContext.Provider value={presenceMap}>
      {children}
    </PresenceContext.Provider>
  );
}
