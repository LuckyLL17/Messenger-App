import prisma from "@/app/libs/prismadb";

interface MentionableUser {
  id: string;
  name: string | null;
  email: string | null;
}

/**
 * 未读计数永远从数据库的已读记录（Message.seenIds）派生，
 * 保证任何客户端、任何标签页看到的计数都与实际已读状态一致。
 */
export const getUnreadCounts = async (
  conversationId: string,
  userId: string,
): Promise<{ unreadCount: number; mentionCount: number }> => {
  const unseenWhere = {
    conversationId,
    senderId: { not: userId },
    NOT: { seenIds: { has: userId } },
  };

  const [unreadCount, mentionCount] = await Promise.all([
    prisma.message.count({ where: unseenWhere }),
    prisma.message.count({
      where: {
        ...unseenWhere,
        mentionedIds: { has: userId },
      },
    }),
  ]);

  return { unreadCount, mentionCount };
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mentionsToken = (text: string, token: string) =>
  new RegExp(`@${escapeRegExp(token)}(?!\\w)`, "i").test(text);

/**
 * 解析消息正文中的 @提及，支持 @用户名、@邮箱、@邮箱前缀。
 * 发送者自己不会被计入提及。
 */
export const getMentionedUserIds = (
  body: string | null | undefined,
  users: MentionableUser[],
  senderId: string,
): string[] => {
  if (!body) {
    return [];
  }

  return users
    .filter((user) => user.id !== senderId)
    .filter((user) => {
      const name = user.name?.trim();
      const email = user.email?.trim();
      const emailLocalPart = email?.split("@")[0];

      return (
        (name && mentionsToken(body, name)) ||
        (email && mentionsToken(body, email)) ||
        (emailLocalPart && mentionsToken(body, emailLocalPart))
      );
    })
    .map((user) => user.id);
};
