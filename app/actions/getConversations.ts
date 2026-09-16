import prisma from "@/app/libs/prismadb";
import getCurrentUser from "./getCurrentUser";

const getConversations = async () => {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id) {
    return [];
  }

  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: {
        lastMessageAt: "desc",
      },
      where: {
        userIds: {
          has: currentUser.id,
        },
      },
      include: {
        users: true,
        messages: {
          include: {
            sender: true,
            seen: true,
          },
        },
      },
    });

    // 未读/提及计数直接从消息的 seenIds 派生，保证与实际已读记录一致
    return conversations.map((conversation) => {
      let unreadCount = 0;
      let mentionCount = 0;

      conversation.messages.forEach((message) => {
        if (message.senderId === currentUser.id) {
          return;
        }
        if (message.seenIds.includes(currentUser.id)) {
          return;
        }

        unreadCount += 1;
        if (message.mentionedIds?.includes(currentUser.id)) {
          mentionCount += 1;
        }
      });

      return {
        ...conversation,
        unreadCount,
        mentionCount,
      };
    });
  } catch (error) {
    return [];
  }
};

export default getConversations;
