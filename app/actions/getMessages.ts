import prisma from "@/app/libs/prismadb";
import {
  conversationUsersInclude,
  findAccessibleConversation,
} from "./conversationAccess";

/**
 * 读取某会话的消息列表（页面数据入口）。
 * 与单聊/群聊页面共用同一条规则：当前用户必须是该会话成员，否则返回空列表，
 * 从而保证消息读取不会绕过会话访问控制。
 */
const getMessages = async (conversationId: string) => {
  try {
    const conversation = await findAccessibleConversation(
      conversationId,
      conversationUsersInclude,
    );

    if (!conversation) {
      return [];
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
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
