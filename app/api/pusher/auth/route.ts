import { NextResponse } from "next/server";
import { pusherServer } from "@/app/libs/pusher";
import {
  accessDeniedResponse,
  authorizePusherChannel,
} from "@/app/actions/conversationAccess";

export async function POST(request: Request) {
  const body = await request.text();
  const searchParams = new URLSearchParams(body);
  const socketId = searchParams.get("socket_id");
  const channel = searchParams.get("channel_name");

  if (!socketId || !channel) {
    return new NextResponse("Socket ID and Channel are required", {
      status: 400,
    });
  }

  // 统一鉴权：个人通知频道仅本人可订阅；会话频道仅成员可订阅（单聊/群聊相同）。
  const access = await authorizePusherChannel(channel);

  if (access.status !== "authenticated") {
    return accessDeniedResponse(access.status);
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channel, {
    user_id: access.currentUser.email!,
  });
  return NextResponse.json(authResponse);
}
