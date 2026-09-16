import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import { getMentionedUserIds, getUnreadCounts } from "@/app/libs/unread";

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    const body = await request.json();
    const { message, image, conversationId } = body;

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      include: {
        users: true,
      },
    });

    if (!conversation) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    if (!conversation.userIds.includes(currentUser.id)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 群聊中解析 @提及，单聊不解析
    const mentionedIds = conversation.isGroup
      ? getMentionedUserIds(message, conversation.users, currentUser.id)
      : [];

    const newMessage = await prisma.message.create({
      include: {
        seen: true,
        sender: true,
      },
      data: {
        body: message,
        image: image,
        mentionedIds,
        conversation: {
          connect: { id: conversationId },
        },
        sender: {
          connect: { id: currentUser.id },
        },
        seen: {
          connect: {
            id: currentUser.id,
          },
        },
      },
    });

    await prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        lastMessageAt: new Date(),
        messages: {
          connect: {
            id: newMessage.id,
          },
        },
      },
    });

    await pusherServer.trigger(conversationId, "messages:new", newMessage);

    // 按接收人分别计算未读/提及计数并随事件下发，
    // 客户端直接采用服务端计数，不自行累加，避免重复计数。
    await Promise.all(
      conversation.users.map(async (user) => {
        if (!user.email) {
          return;
        }

        const { unreadCount, mentionCount } = await getUnreadCounts(
          conversationId,
          user.id,
        );

        return pusherServer.trigger(user.email, "conversation:update", {
          id: conversationId,
          messages: [newMessage],
          unreadCount,
          mentionCount,
        });
      }),
    );

    return NextResponse.json(newMessage);
  } catch (error) {
    console.log(error, "ERROR_MESSAGES");
    return new NextResponse("Error", { status: 500 });
  }
}
