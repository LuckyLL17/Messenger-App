import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import { isAllowedReaction } from "@/app/libs/reactions";

const MESSAGE_INCLUDE = {
  sender: true,
  seen: true,
  reactions: {
    include: {
      user: true,
    },
  },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const currentUser = await getCurrentUser();
    const { messageId } = await params;
    const body = await request.json();
    const { emoji } = body;

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!isAllowedReaction(emoji)) {
      return new NextResponse("Invalid emoji", { status: 400 });
    }

    const message = await prisma.message.findUnique({
      where: {
        id: messageId,
      },
      include: {
        conversation: {
          include: {
            users: true,
          },
        },
      },
    });

    if (!message) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    const isMember = message.conversation.users.some(
      (user) => user.id === currentUser.id,
    );

    if (!isMember) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const existing = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: message.id,
          userId: currentUser.id,
          emoji,
        },
      },
    });

    if (existing) {
      // deleteMany is idempotent: concurrent removals of the same
      // reaction all succeed and converge to "removed".
      await prisma.reaction.deleteMany({
        where: {
          messageId: message.id,
          userId: currentUser.id,
          emoji,
        },
      });
    } else {
      // upsert keyed by the unique (messageId, userId, emoji) constraint:
      // concurrent additions of the same reaction converge to one row.
      await prisma.reaction.upsert({
        where: {
          messageId_userId_emoji: {
            messageId: message.id,
            userId: currentUser.id,
            emoji,
          },
        },
        update: {},
        create: {
          emoji,
          message: {
            connect: { id: message.id },
          },
          user: {
            connect: { id: currentUser.id },
          },
        },
      });
    }

    // Read the post-write state so every broadcast carries the full,
    // converged reaction list for this message.
    const updatedMessage = await prisma.message.findUnique({
      where: {
        id: message.id,
      },
      include: MESSAGE_INCLUDE,
    });

    await pusherServer.trigger(
      message.conversationId,
      "message:update",
      updatedMessage,
    );

    return NextResponse.json(updatedMessage);
  } catch (error) {
    console.log(error, "ERROR_MESSAGE_REACTION");
    return new NextResponse("Error", { status: 500 });
  }
}
