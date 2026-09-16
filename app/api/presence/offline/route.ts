import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  ensurePresenceSweeper,
  recordOffline,
} from "@/app/libs/presenceService";

// Called via navigator.sendBeacon on pagehide (and on sign-out) so a closed
// tab goes offline immediately instead of waiting for the heartbeat TTL.
// Only the departing device is removed — other devices keep the user online.
export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // sendBeacon posts with a simple content type, so parse leniently.
    const text = await request.text();
    const body = text ? JSON.parse(text) : {};
    const { deviceId } = body;

    if (typeof deviceId !== "string" || !deviceId) {
      return new NextResponse("deviceId is required", { status: 400 });
    }

    ensurePresenceSweeper();
    await recordOffline(currentUser.id, deviceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log(error, "ERROR_PRESENCE_OFFLINE");
    return new NextResponse("Error", { status: 500 });
  }
}
