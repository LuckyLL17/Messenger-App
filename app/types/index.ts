import { User, Conversation, Message } from "@prisma/client";

export type FullMessageType = Message & {
  sender: User;
  seen: User[];
};

export type FullConversationType = Conversation & {
  users: User[];
  messages: FullMessageType[];
};

export interface SearchSenderType {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface SearchMessageType {
  id: string;
  body: string | null;
  image: string | null;
  createdAt: string;
  conversationId: string;
  sender: SearchSenderType;
}

export interface SearchConversationType {
  id: string;
  name: string | null;
  isGroup: boolean | null;
  users: SearchSenderType[];
}

export interface SearchGroupType {
  conversation: SearchConversationType;
  messages: SearchMessageType[];
}

export interface SearchResponseType {
  groups: SearchGroupType[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
