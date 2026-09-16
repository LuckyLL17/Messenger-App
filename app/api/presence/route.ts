import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  ensurePresenceSweeper,
  getPresenceSnapshot,
} from "@/app/libs/presenceService";

// Full presence snapshot. Clients fetch it on mount and after every
// realtime reconnect so their local view re-converges with the server.
export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    ensurePresenceSweeper();
    const snapshot = await getPresenceSnapshot();

    return NextResponse.json(snapshot);
  } catch (error) {
    console.log(error, "ERROR_PRESENCE_SNAPSHOT");
    return new NextResponse("Error", { status: 500 });
  }
}
