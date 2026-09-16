import { User, Conversation, Message } from "@prisma/client";

export type FullMessageType = Message & {
  sender: User;
  seen: User[];
};

export type FullConversationType = Conversation & {
  users: User[];
  messages: FullMessageType[];
  unreadCount?: number;
  mentionCount?: number;
};

export type ConversationUpdatePayload = {
  id: string;
  messages: FullMessageType[];
  unreadCount?: number;
  mentionCount?: number;
};
