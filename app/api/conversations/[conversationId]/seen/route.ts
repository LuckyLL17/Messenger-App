import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import { getUnreadCounts } from "@/app/libs/unread";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const currentUser = await getCurrentUser();
    const { conversationId } = await params;
    const body = await request.json().catch(() => ({}));
    const lastMessageId = body?.lastMessageId as string | undefined;

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      include: {
        users: true,
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!conversation) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    if (!conversation.userIds.includes(currentUser.id)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const messages = conversation.messages;
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) {
      return NextResponse.json({ unreadCount: 0, mentionCount: 0 });
    }

    // 只清除“本次真正看到”的消息：以客户端上报的最后一条已渲染消息为截止点，
    // 截止点之后新到的消息保持未读，继续计入未读数。
    let cutoff = lastMessage;
    if (lastMessageId) {
      const found = messages.find((message) => message.id === lastMessageId);
      if (!found) {
        return new NextResponse("Invalid message", { status: 400 });
      }
      cutoff = found;
    }

    const unseenMessages = messages.filter((message) => {
      const isBeforeCutoff =
        message.createdAt <= cutoff.createdAt || message.id === cutoff.id;

      return (
        isBeforeCutoff &&
        message.senderId !== currentUser.id &&
        !message.seenIds.includes(currentUser.id)
      );
    });

    if (unseenMessages.length > 0) {
      // connect 在 MongoDB 下是 $addToSet 语义，天然幂等：
      // 多标签页或多次开关会话重复上报，不会产生重复已读记录。
      const updatedMessages = await prisma.$transaction(
        unseenMessages.map((message) =>
          prisma.message.update({
            where: {
              id: message.id,
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
          }),
        ),
      );

      await pusherServer.triggerBatch(
        updatedMessages.map((message) => ({
          channel: conversationId,
          name: "message:update",
          data: message,
        })),
      );
    }

    const updatedLastMessage = await prisma.message.findUnique({
      where: {
        id: lastMessage.id,
      },
      include: {
        sender: true,
        seen: true,
      },
    });

    const { unreadCount, mentionCount } = await getUnreadCounts(
      conversationId,
      currentUser.id,
    );

    // 推送到该用户的所有标签页，保证多处打开的计数保持一致
    await pusherServer.trigger(currentUser.email, "conversation:update", {
      id: conversationId,
      messages: updatedLastMessage ? [updatedLastMessage] : [],
      unreadCount,
      mentionCount,
    });

    return NextResponse.json({ unreadCount, mentionCount });
  } catch (error) {
    console.log(error, "ERROR_MESSAGES_SEEN");
    return new NextResponse("Error", { status: 500 });
  }
}
