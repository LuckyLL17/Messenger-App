"use client";

import { createContext, useContext } from "react";
import { PresenceStatus } from "@/app/libs/presence";

export interface PresenceEntry {
  status: PresenceStatus;
  lastSeenAt: string | null;
}

// Keyed by user email (the same identifier Pusher channels already use).
export type PresenceMap = Record<string, PresenceEntry>;

export const PresenceContext = createContext<PresenceMap>({});

export const getPresenceStatus = (
  map: PresenceMap,
  email?: string | null,
): PresenceStatus => {
  if (!email) {
    return "offline";
  }

  return map[email]?.status ?? "offline";
};

export function usePresenceMap(): PresenceMap {
  return useContext(PresenceContext);
}

export function useUserStatus(email?: string | null): PresenceStatus {
  const map = useContext(PresenceContext);
  return getPresenceStatus(map, email);
}
