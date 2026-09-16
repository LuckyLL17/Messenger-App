import prisma from "@/app/libs/prismadb";
import getCurrentUser from "./getCurrentUser";

const getMessages = async (conversationId: string) => {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser?.id) {
      return [];
    }

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        userIds: true,
      },
    });

    if (!conversation || !conversation.userIds.includes(currentUser.id)) {
      return [];
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversationId,
      },
      include: {
        sender: true,
        seen: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return messages;
  } catch (error: any) {
    return [];
  }
};

export default getMessages;
