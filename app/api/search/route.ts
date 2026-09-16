import { NextRequest, NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";

// Only the first page of matches is ever searched, so the cost stays bounded
// even when an account has accumulated a very large message history.
export const SEARCH_PAGE_SIZE = 20;
// Keyword search requires at least two characters (after trimming).
export const MIN_KEYWORD_LENGTH = 2;

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get("keyword") || "").trim();
  const senderId = (searchParams.get("senderId") || "").trim();
  const page = Math.max(
    1,
    parseInt(searchParams.get("page") || "1", 10) || 1,
  );

  if (keyword.length > 0 && keyword.length < MIN_KEYWORD_LENGTH) {
    return NextResponse.json(
      { error: "KEYWORD_TOO_SHORT", minLength: MIN_KEYWORD_LENGTH },
      { status: 400 },
    );
  }

  if (!keyword && !senderId) {
    return NextResponse.json(
      { error: "MISSING_FILTERS" },
      { status: 400 },
    );
  }

  if (senderId && !OBJECT_ID_REGEX.test(senderId)) {
    return NextResponse.json(
      { error: "INVALID_SENDER" },
      { status: 400 },
    );
  }

  // Scope every search to conversations the current user actually participates in.
  const conversations = await prisma.conversation.findMany({
    where: {
      userIds: {
        has: currentUser.id,
      },
    },
    select: {
      id: true,
      name: true,
      isGroup: true,
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  const conversationMap = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );

  // The keyword only matches message bodies; sender-only searches also surface
  // image messages, which cannot be matched by text.
  const messageWhere: Record<string, unknown> = {
    conversationId: {
      in: Array.from(conversationMap.keys()),
    },
  };

  if (senderId) {
    messageWhere.senderId = senderId;
  }

  if (keyword && !senderId) {
    messageWhere.body = {
      contains: keyword,
      mode: "insensitive",
    };
  }

  if (keyword && senderId) {
    // Either a text hit from this sender, or an image sent by them.
    messageWhere.AND = [
      { senderId },
      {
        OR: [
          {
            body: {
              contains: keyword,
              mode: "insensitive",
            },
          },
          { image: { not: null }, body: null },
        ],
      },
    ];
    delete messageWhere.senderId;
  }

  const [total, messages] = await Promise.all([
    prisma.message.count({ where: messageWhere }),
    prisma.message.findMany({
      where: messageWhere,
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * SEARCH_PAGE_SIZE,
      take: SEARCH_PAGE_SIZE,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    }),
  ]);

  // Group matches by conversation on the server so the client renders stable,
  // ordered sections regardless of which page a match came from.
  const groups = messages.reduce<
    Record<
      string,
      {
        conversation: {
          id: string;
          name: string | null;
          isGroup: boolean | null;
          users: {
            id: string;
            name: string | null;
            email: string | null;
            image: string | null;
          }[];
        };
        messages: typeof messages;
      }
    >
  >((acc, message) => {
    const conversation = conversationMap.get(message.conversationId);

    if (!conversation) {
      return acc;
    }

    if (!acc[message.conversationId]) {
      acc[message.conversationId] = {
        conversation: {
          id: conversation.id,
          name: conversation.name,
          isGroup: conversation.isGroup,
          users: conversation.users,
        },
        messages: [],
      };
    }

    acc[message.conversationId].messages.push(message);

    return acc;
  }, {});

  const hasMore = page * SEARCH_PAGE_SIZE < total;

  return NextResponse.json({
    groups: Object.values(groups),
    total,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    hasMore,
  });
}
