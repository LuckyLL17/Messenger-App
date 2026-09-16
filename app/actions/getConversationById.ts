import {
  conversationUsersInclude,
  findAccessibleConversation,
} from "./conversationAccess";

/**
 * 读取单个会话（页面数据入口）。
 * 仅当当前用户是会话成员时返回会话，否则（未登录 / 不存在 / 非成员）返回 null。
 * 单聊与群聊规则一致。
 */
const getConversationById = async (conversationId: string) => {
  try {
    return await findAccessibleConversation(
      conversationId,
      conversationUsersInclude,
    );
  } catch (error: any) {
    console.log(error, "SERVER_ERROR");
    return null;
  }
};

export default getConversationById;
