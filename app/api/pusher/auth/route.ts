import { NextResponse } from "next/server";
import { pusherServer } from "@/app/libs/pusher";
import getCurrentUser from "@/app/actions/getCurrentUser";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await request.text();
  const searchParams = new URLSearchParams(body);
  const socketId = searchParams.get("socket_id");
  const channel = searchParams.get("channel_name");

  if (!socketId || !channel) {
    return new NextResponse("Socket ID and Channel are required", {
      status: 400,
    });
  }

  const data = {
    user_id: currentUser.email,
  };

  const authResponse = pusherServer.authorizeChannel(socketId, channel, data);
  return NextResponse.json(authResponse);
}
