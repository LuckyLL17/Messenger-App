import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  ensurePresenceSweeper,
  recordHeartbeat,
} from "@/app/libs/presenceService";

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { deviceId, state } = body ?? {};

    if (
      typeof deviceId !== "string" ||
      !deviceId ||
      (state !== "active" && state !== "away")
    ) {
      return new NextResponse("deviceId and a valid state are required", {
        status: 400,
      });
    }

    ensurePresenceSweeper();
    await recordHeartbeat(currentUser.id, deviceId, state);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log(error, "ERROR_PRESENCE_HEARTBEAT");
    return new NextResponse("Error", { status: 500 });
  }
}
