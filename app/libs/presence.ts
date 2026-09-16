// Shared presence constants & types. This file is imported by both client
// and server code, so it must stay free of any server-only dependencies
// (no prisma, no pusher server).

export type PresenceStatus = "online" | "away" | "offline";

// Per-device state reported by clients in their heartbeats.
export type DeviceState = "active" | "away";

export interface PresenceSnapshotEntry {
  email: string;
  status: PresenceStatus;
  lastSeenAt: string | null;
}

export const PRESENCE_CHANNEL = "presence";
export const PRESENCE_UPDATE_EVENT = "presence:update";

// How often each connected tab/device pings the server.
export const HEARTBEAT_INTERVAL_MS = 25_000;

// A device is considered gone if no heartbeat arrives within this window.
// Deliberately several multiples of the heartbeat interval so a few dropped
// heartbeats (network jitter, throttled background tabs) don't flap status.
export const PRESENCE_TTL_MS = 120_000;

// How often the server sweeps for expired devices and broadcasts "offline".
export const SWEEP_INTERVAL_MS = 30_000;

// No mouse/keyboard activity for this long => the device reports "away".
export const IDLE_TIMEOUT_MS = 5 * 60_000;
