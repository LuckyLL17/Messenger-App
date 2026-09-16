import prisma from "@/app/libs/prismadb";
import getCurrentUser from "./getCurrentUser";

export interface SearchParticipant {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

// Returns every user who shares at least one conversation with the current
// user. These populate the "sender" filter on the search view.
const getSearchParticipants = async (): Promise<SearchParticipant[]> => {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id) {
    return [];
  }

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        userIds: {
          has: currentUser.id,
        },
      },
      select: {
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

    const uniqueUsers = new Map<string, SearchParticipant>();

    conversations.forEach((conversation) => {
      conversation.users.forEach((user) => {
        if (!uniqueUsers.has(user.id)) {
          uniqueUsers.set(user.id, user);
        }
      });
    });

    return Array.from(uniqueUsers.values());
  } catch (error) {
    return [];
  }
};

export default getSearchParticipants;
