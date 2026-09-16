import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import {
  accessDeniedResponse,
  authorizeConversationAccess,
  conversationSeenInclude,
} from "@/app/actions/conversationAccess";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;

    // 统一鉴权：仅会话成员可提交已读回执（单聊/群聊相同）。
    // 授权同时返回带 messages/seen/users 的会话，无需再次查询。
    const access = await authorizeConversationAccess(
      conversationId,
      conversationSeenInclude,
    );

    if (access.status !== "authenticated") {
      return accessDeniedResponse(access.status);
    }

    const { currentUser, data: conversation } = access;

    const lastMessage = conversation.messages[conversation.messages.length - 1];

    if (!lastMessage) {
      return NextResponse.json(conversation);
    }

    const updatedMessage = await prisma.message.update({
      where: {
        id: lastMessage.id,
      },
      include: {
        sender: true,
        seen: true,
      },
      data: {
        seen: {
          connect: {
            id: currentUser.id,
          },
        },
      },
    });

    await pusherServer.trigger(currentUser.email!, "conversation:update", {
      id: conversationId,
      messages: [updatedMessage],
    });

    if (lastMessage.seenIds?.indexOf(currentUser.id) !== -1) {
      return NextResponse.json(conversation);
    }

    await pusherServer.trigger(
      conversationId!,
      "message:update",
      updatedMessage,
    );

    return NextResponse.json(updatedMessage);
  } catch (error) {
    console.log(error, "ERROR_MESSAGES_SEEN");
    return new NextResponse("Error", { status: 500 });
  }
}
