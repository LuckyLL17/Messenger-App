import prisma from "@/app/libs/prismadb";
import getCurrentUser from "./getCurrentUser";
import { messageSenderAndSeenInclude } from "./conversationAccess";

/**
 * 当前用户的会话列表（侧边栏数据入口）。
 * 访问规则与会话详情/消息/已读一致：只返回 userIds 含当前用户的会话。
 */
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
          include: messageSenderAndSeenInclude,
        },
      },
    });

    return conversations;
  } catch (error) {
    return [];
  }
};

export default getConversations;
