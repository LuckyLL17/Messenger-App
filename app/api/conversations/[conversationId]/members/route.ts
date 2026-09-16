import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";

interface IParams {
  conversationId: string;
}

const conversationInclude = {
  users: true,
  messages: {
    include: {
      sender: true,
      seen: true,
    },
  },
};

const getFullConversation = (conversationId: string) =>
  prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });

const createSystemMessage = async (
  conversationId: string,
  actorId: string,
  body: string,
) => {
  const systemMessage = await prisma.message.create({
    data: {
      body,
      isSystem: true,
      conversation: { connect: { id: conversationId } },
      sender: { connect: { id: actorId } },
      seen: { connect: { id: actorId } },
    },
    include: {
      sender: true,
      seen: true,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      messages: { connect: { id: systemMessage.id } },
    },
  });

  return systemMessage;
};

// GET /api/conversations/[conversationId]/members
// Returns the audit trail of member changes for this conversation.
export async function GET(
  request: Request,
  { params }: { params: Promise<IParams> },
) {
  try {
    const currentUser = await getCurrentUser();
    const { conversationId } = await params;

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    if (!conversation.userIds.includes(currentUser.id)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const events = await prisma.conversationMemberEvent.findMany({
      where: { conversationId },
      include: {
        actor: true,
        target: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return NextResponse.json(events);
  } catch (error: any) {
    console.log(error, "ERROR_MEMBERS_GET");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// POST /api/conversations/[conversationId]/members
// Owner invites new members to the group. Body: { memberIds: string[] }
export async function POST(
  request: Request,
  { params }: { params: Promise<IParams> },
) {
  try {
    const currentUser = await getCurrentUser();
    const { conversationId } = await params;
    const body = await request.json();
    const { memberIds } = body;

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("Invalid data", { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { users: true },
    });

    if (!conversation) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    if (!conversation.isGroup) {
      return new NextResponse("Not a group conversation", { status: 400 });
    }

    if (conversation.ownerId !== currentUser.id) {
      return new NextResponse("Only the group owner can add members", {
        status: 403,
      });
    }

    // Skip people who are already in the group.
    const newMemberIds = (memberIds as string[]).filter(
      (id) => !conversation.userIds.includes(id),
    );

    if (newMemberIds.length === 0) {
      return new NextResponse("Selected users are already in the group", {
        status: 409,
      });
    }

    const newMembers = await prisma.user.findMany({
      where: { id: { in: newMemberIds } },
    });

    if (newMembers.length !== newMemberIds.length) {
      return new NextResponse("Invalid members", { status: 400 });
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        users: {
          connect: newMemberIds.map((id) => ({ id })),
        },
      },
    });

    await prisma.conversationMemberEvent.createMany({
      data: newMemberIds.map((targetId) => ({
        type: "MEMBER_ADDED",
        conversationId,
        actorId: currentUser.id,
        targetId,
      })),
    });

    const addedNames = newMembers.map((user) => user.name).join(", ");
    const systemMessage = await createSystemMessage(
      conversationId,
      currentUser.id,
      `${currentUser.name} added ${addedNames} to the group`,
    );

    const updatedConversation = await getFullConversation(conversationId);

    // Existing members get an update, new members get the conversation itself.
    const newMemberIdSet = new Set(newMemberIds);
    await Promise.all(
      updatedConversation!.users.map((user) =>
        pusherServer.trigger(
          user.email!,
          newMemberIdSet.has(user.id) ? "conversation:new" : "conversation:update",
          updatedConversation,
        ),
      ),
    );

    // Clients viewing the conversation refresh header/drawer and message list.
    await pusherServer.trigger(
      conversationId,
      "conversation:update",
      updatedConversation,
    );
    await pusherServer.trigger(conversationId, "messages:new", systemMessage);

    return NextResponse.json(updatedConversation);
  } catch (error: any) {
    console.log(error, "ERROR_MEMBERS_POST");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// DELETE /api/conversations/[conversationId]/members
// Owner removes a member, or any member removes themselves to leave.
// Body: { memberId: string }
export async function DELETE(
  request: Request,
  { params }: { params: Promise<IParams> },
) {
  try {
    const currentUser = await getCurrentUser();
    const { conversationId } = await params;
    const body = await request.json();
    const { memberId } = body;

    if (!currentUser?.id || !currentUser?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!memberId || typeof memberId !== "string") {
      return new NextResponse("Invalid data", { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { users: true },
    });

    if (!conversation) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    if (!conversation.isGroup) {
      return new NextResponse("Not a group conversation", { status: 400 });
    }

    const target = conversation.users.find((user) => user.id === memberId);

    if (!target) {
      return new NextResponse("User is not a member of this group", {
        status: 404,
      });
    }

    const isSelf = memberId === currentUser.id;
    const isOwner = conversation.ownerId === currentUser.id;

    if (!isSelf && !isOwner) {
      return new NextResponse("Only the group owner can remove members", {
        status: 403,
      });
    }

    // The owner can only leave the group themselves, never be removed.
    if (!isSelf && memberId === conversation.ownerId) {
      return new NextResponse("The group owner cannot be removed", {
        status: 400,
      });
    }

    const remainingUsers = conversation.users.filter(
      (user) => user.id !== memberId,
    );

    // A group cannot survive with a single member: dissolve it entirely.
    if (remainingUsers.length < 2) {
      await prisma.conversationMemberEvent.create({
        data: {
          type: isSelf ? "MEMBER_LEFT" : "MEMBER_REMOVED",
          conversationId,
          actorId: currentUser.id,
          targetId: memberId,
        },
      });

      await prisma.conversation.delete({
        where: { id: conversationId },
      });

      await Promise.all(
        conversation.users.map((user) =>
          pusherServer.trigger(user.email!, "conversation:remove", {
            id: conversationId,
          }),
        ),
      );

      return NextResponse.json({ id: conversationId, dissolved: true });
    }

    const ownershipTransferred =
      isSelf && memberId === conversation.ownerId;
    const newOwnerId = ownershipTransferred
      ? remainingUsers[0].id
      : undefined;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        users: {
          disconnect: { id: memberId },
        },
        ...(newOwnerId ? { owner: { connect: { id: newOwnerId } } } : {}),
      },
    });

    await prisma.conversationMemberEvent.create({
      data: {
        type: isSelf ? "MEMBER_LEFT" : "MEMBER_REMOVED",
        conversationId,
        actorId: currentUser.id,
        targetId: memberId,
      },
    });

    const systemMessage = await createSystemMessage(
      conversationId,
      currentUser.id,
      isSelf
        ? `${currentUser.name} left the group`
        : `${currentUser.name} removed ${target.name} from the group`,
    );

    let transferMessage: Awaited<
      ReturnType<typeof createSystemMessage>
    > | null = null;

    if (ownershipTransferred && newOwnerId) {
      await prisma.conversationMemberEvent.create({
        data: {
          type: "OWNER_TRANSFERRED",
          conversationId,
          actorId: currentUser.id,
          targetId: newOwnerId,
        },
      });

      const newOwner = remainingUsers.find((user) => user.id === newOwnerId);

      transferMessage = await createSystemMessage(
        conversationId,
        currentUser.id,
        `${newOwner?.name} is now the group owner`,
      );
    }

    const updatedConversation = await getFullConversation(conversationId);

    // The departing user loses the conversation and all of its live events.
    await pusherServer.trigger(target.email!, "conversation:remove", {
      id: conversationId,
    });

    await Promise.all(
      updatedConversation!.users.map((user) =>
        pusherServer.trigger(
          user.email!,
          "conversation:update",
          updatedConversation,
        ),
      ),
    );

    await pusherServer.trigger(
      conversationId,
      "conversation:update",
      updatedConversation,
    );
    await pusherServer.trigger(conversationId, "messages:new", systemMessage);

    if (transferMessage) {
      await pusherServer.trigger(
        conversationId,
        "messages:new",
        transferMessage,
      );
    }

    return NextResponse.json(updatedConversation);
  } catch (error: any) {
    console.log(error, "ERROR_MEMBERS_DELETE");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
