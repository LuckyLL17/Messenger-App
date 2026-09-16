// Server-side presence service. Tracks one heartbeat record per
// (user, device) pair, aggregates them into a per-user status and
// broadcasts transitions over Pusher.
//
// Status rules:
//   online  - at least one fresh device reporting "active"
//   away    - at least one fresh device, but all report "away" (idle/hidden)
//   offline - no fresh devices (heartbeat TTL expired or explicit logout)
//
// "Fresh" means lastSeenAt is within PRESENCE_TTL_MS, which is what
// guarantees stale state never lingers: expired records are ignored in
// every computation and physically deleted by the sweeper.

import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import {
  DeviceState,
  PRESENCE_CHANNEL,
  PRESENCE_TTL_MS,
  PRESENCE_UPDATE_EVENT,
  PresenceSnapshotEntry,
  PresenceStatus,
  SWEEP_INTERVAL_MS,
} from "@/app/libs/presence";

const freshCutoff = () => new Date(Date.now() - PRESENCE_TTL_MS);

async function broadcastPresence(
  email: string,
  status: PresenceStatus,
  lastSeenAt: Date | null,
) {
  try {
    await pusherServer.trigger(PRESENCE_CHANNEL, PRESENCE_UPDATE_EVENT, {
      email,
      status,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    });
  } catch (error) {
    console.log(error, "ERROR_PRESENCE_BROADCAST");
  }
}

// Recompute a user's status from their fresh devices and, when it changed,
// persist + broadcast the transition. Multi-device safe: a user only goes
// offline once every device has expired.
async function syncUserPresence(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, presenceStatus: true },
  });

  if (!user?.email) {
    return;
  }

  const devices = await prisma.presence.findMany({
    where: { userId, lastSeenAt: { gte: freshCutoff() } },
  });

  const status: PresenceStatus = devices.length
    ? devices.some((device) => device.state === "active")
      ? "online"
      : "away"
    : "offline";

  const lastSeenAt = devices.length
    ? new Date(Math.max(...devices.map((device) => device.lastSeenAt.getTime())))
    : null;

  if (user.presenceStatus !== status) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        presenceStatus: status,
        ...(lastSeenAt ? { lastSeenAt } : {}),
      },
    });
    await broadcastPresence(user.email, status, lastSeenAt);
  } else if (lastSeenAt) {
    // Status unchanged; just keep the user's lastSeenAt moving forward.
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt },
    });
  }
}

export async function recordHeartbeat(
  userId: string,
  deviceId: string,
  state: DeviceState,
) {
  await prisma.presence.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    update: { state, lastSeenAt: new Date() },
    create: { userId, deviceId, state, lastSeenAt: new Date() },
  });

  await syncUserPresence(userId);
}

export async function recordOffline(userId: string, deviceId: string) {
  await prisma.presence.deleteMany({ where: { userId, deviceId } });
  await syncUserPresence(userId);
}

// Snapshot of everyone currently online/away. Users without a fresh device
// are simply omitted, which clients treat as "offline" — so expired state
// can never leak into the UI.
export async function getPresenceSnapshot(): Promise<PresenceSnapshotEntry[]> {
  const devices = await prisma.presence.findMany({
    where: { lastSeenAt: { gte: freshCutoff() } },
    include: { user: { select: { email: true } } },
  });

  const byEmail = new Map<string, PresenceSnapshotEntry>();

  for (const device of devices) {
    const email = device.user?.email;
    if (!email) {
      continue;
    }

    const existing = byEmail.get(email);
    const lastSeenAt = device.lastSeenAt.toISOString();

    if (!existing) {
      byEmail.set(email, {
        email,
        status: device.state === "active" ? "online" : "away",
        lastSeenAt,
      });
    } else {
      byEmail.set(email, {
        email,
        status:
          existing.status === "online" || device.state === "active"
            ? "online"
            : "away",
        lastSeenAt:
          existing.lastSeenAt && existing.lastSeenAt > lastSeenAt
            ? existing.lastSeenAt
            : lastSeenAt,
      });
    }
  }

  return [...byEmail.values()];
}

// Periodically expires devices whose heartbeats stopped (browser killed,
// machine slept, network lost without a clean close) and broadcasts the
// resulting "offline" transitions. Without this, an abruptly closed
// browser would appear online until someone happened to recheck.
async function sweepExpiredPresence() {
  try {
    const cutoff = freshCutoff();

    const [candidates, freshDevices] = await Promise.all([
      prisma.user.findMany({
        where: { presenceStatus: { in: ["online", "away"] } },
        select: { id: true, email: true, lastSeenAt: true },
      }),
      prisma.presence.findMany({
        where: { lastSeenAt: { gte: cutoff } },
        select: { userId: true },
      }),
    ]);

    const freshUserIds = new Set(freshDevices.map((device) => device.userId));

    for (const user of candidates) {
      if (freshUserIds.has(user.id)) {
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { presenceStatus: "offline" },
      });

      if (user.email) {
        await broadcastPresence(user.email, "offline", user.lastSeenAt);
      }
    }

    // Physically remove expired device records so they don't accumulate.
    await prisma.presence.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });
  } catch (error) {
    console.log(error, "ERROR_PRESENCE_SWEEP");
  }
}

// Guarded via globalThis so Next.js dev hot-reloads don't stack intervals.
const globalForPresence = globalThis as unknown as {
  presenceSweeperStarted?: boolean;
};

export function ensurePresenceSweeper() {
  if (globalForPresence.presenceSweeperStarted) {
    return;
  }
  globalForPresence.presenceSweeperStarted = true;

  const timer = setInterval(sweepExpiredPresence, SWEEP_INTERVAL_MS);
  // Never keep the Node process alive just for the sweeper.
  timer.unref?.();
}
