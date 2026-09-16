import { User, Conversation, Message, Reaction } from "@prisma/client";

export type FullReactionType = Reaction & {
  user: User;
};

export type FullMessageType = Message & {
  sender: User;
  seen: User[];
  reactions: FullReactionType[];
};

export type FullConversationType = Conversation & {
  users: User[];
  messages: FullMessageType[];
};
