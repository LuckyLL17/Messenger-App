import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";

/**
 * 统一的会话访问控制层
 * ----------------------
 * 全应用（单聊 / 群聊 / 消息列表 / 已读回执 / Pusher 频道订阅）共用同一条规则：
 *
 *   已认证用户只能访问「自身 user.id 出现在 conversation.userIds 中」的会话。
 *   单聊与群聊不做区分 —— 是否成员是唯一的判定依据。
 *
 * 不存在的会话与存在但无权访问的会话对外表现一致（notAllowed），
 * 避免通过状态差异泄露会话是否存在。
 */

/**
 * 会话相关查询共用的 include 形状。
 * 集中定义，保证页面、接口拿到的数据结构与重构前完全一致。
 */
export const conversationUsersInclude = {
  users: true,
} satisfies Prisma.ConversationInclude;

export const conversationSeenInclude = {
  users: true,
  messages: {
    include: {
      seen: true,
    },
  },
} satisfies Prisma.ConversationInclude;

export const messageSenderAndSeenInclude = {
  sender: true,
  seen: true,
} satisfies Prisma.MessageInclude;

type ConversationPayload<TInclude extends Prisma.ConversationInclude> =
  Prisma.ConversationGetPayload<{ include: TInclude }>;

/**
 * 路由侧鉴权的结论：
 * - authenticated: 已登录，且是该会话成员（data 为命中的会话）
 * - unauthenticated: 未登录（-> 401）
 * - notAllowed: 会话不存在，或当前用户不是成员（-> 403）
 */
export type ConversationAccessResult<
  TInclude extends Prisma.ConversationInclude,
> =
  | {
      status: "authenticated";
      currentUser: NonNullable<
        Awaited<ReturnType<typeof getCurrentUser>>
      >;
      data: ConversationPayload<TInclude>;
    }
  | { status: "unauthenticated" }
  | { status: "notAllowed" };

/** 判断用户是否为会话成员 —— 整套规则的唯一事实来源。 */
export const isConversationMember = (
  conversation: { userIds: string[] },
  userId: string,
) => conversation.userIds.includes(userId);

/**
 * 取「当前用户有权访问」的会话；未登录、会话不存在或非成员一律返回 null。
 * 这是所有会话/消息读取共用的数据入口。
 */
export async function findAccessibleConversation<
  TInclude extends Prisma.ConversationInclude,
>(
  conversationId: string,
  include: TInclude,
): Promise<ConversationPayload<TInclude> | null> {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id) {
    return null;
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userIds: { has: currentUser.id },
    },
    include,
  });

  return (conversation as ConversationPayload<TInclude> | null) ?? null;
}

/**
 * 路由处理器专用：解析当前用户 + 校验会话成员身份，一次查询完成。
 * 配合 accessDeniedResponse 可将拒绝结论直接映射为 HTTP 响应。
 */
export async function authorizeConversationAccess<
  TInclude extends Prisma.ConversationInclude,
>(
  conversationId: string,
  include: TInclude,
): Promise<ConversationAccessResult<TInclude>> {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser?.email) {
    return { status: "unauthenticated" };
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userIds: { has: currentUser.id },
    },
    include,
  });

  if (!conversation) {
    return { status: "notAllowed" };
  }

  return {
    status: "authenticated",
    currentUser,
    data: conversation as ConversationPayload<TInclude>,
  };
}

export type AccessDeniedReason = "unauthenticated" | "notAllowed";

/** 把拒绝原因映射为 HTTP 响应：未登录 401，会话不存在或非成员 403。 */
export function accessDeniedResponse(
  reason: AccessDeniedReason,
): NextResponse {
  if (reason === "unauthenticated") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * 处理器中的标准用法（借助状态字面量做判别联合收窄）：
 *
 *   const access = await authorizeConversationAccess(id, include);
 *   if (access.status !== "authenticated") {
 *     return accessDeniedResponse(access.status);
 *   }
 *   const { currentUser, data } = access;
 */

/**
 * Pusher 私有频道订阅鉴权复用同一条会话成员规则。
 * 频道命名与 app/libs/pusher.ts 中的订阅方保持一致：
 * - `${user.email}`：用户的个人通知频道，仅本人可订阅；
 * - `${conversationId}`：会话频道，仅会话成员可订阅（单聊/群聊相同）。
 *
 * 结论形状与会话鉴权保持一致，授权通过时带回当前用户（用于 Pusher user_id）。
 */
export async function authorizePusherChannel(
  channel: string,
): Promise<
  | {
      status: "authenticated";
      currentUser: NonNullable<
        Awaited<ReturnType<typeof getCurrentUser>>
      >;
    }
  | { status: AccessDeniedReason }
> {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser?.email) {
    return { status: "unauthenticated" };
  }

  if (channel === currentUser.email) {
    return { status: "authenticated", currentUser };
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: channel,
      userIds: { has: currentUser.id },
    },
    select: { id: true },
  });

  if (!conversation) {
    return { status: "notAllowed" };
  }

  return { status: "authenticated", currentUser };
}
