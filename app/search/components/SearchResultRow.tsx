"use client";

import { format } from "date-fns";
import { HiPhoto } from "react-icons/hi2";
import { useRouter } from "next/navigation";

import Avatar from "@/app/components/Avatar";
import {
  SearchConversationType,
  SearchMessageType,
} from "@/app/types";
import { buildSnippet } from "./snippet";

interface SearchResultRowProps {
  conversation: SearchConversationType;
  message: SearchMessageType;
  keyword: string;
  currentUserEmail?: string | null;
}

const getConversationTitle = (
  conversation: SearchConversationType,
  currentUserEmail?: string | null,
) => {
  if (conversation.name) {
    return conversation.name;
  }

  const otherUser = conversation.users.find(
    (user) => user.email !== currentUserEmail,
  );

  return otherUser?.name || otherUser?.email || "未知会话";
};

const SearchResultRow: React.FC<SearchResultRowProps> = ({
  conversation,
  message,
  keyword,
  currentUserEmail,
}) => {
  const router = useRouter();

  const handleClick = () => {
    // Deep-link straight to the matched message; the conversation Body reads
    // this param to scroll it into view and flash a highlight.
    router.push(
      `/conversations/${conversation.id}?message=${message.id}`,
    );
  };

  const segments = buildSnippet(message.body, keyword);
  const isImage = !!message.image;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
      className="
        w-full
        flex
        items-start
        gap-3
        p-3
        rounded-lg
        cursor-pointer
        transition
        hover:bg-neutral-100
        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-violet-500
      "
    >
      <div className="shrink-0">
        <Avatar user={message.sender} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">
            {message.sender.name ||
              message.sender.email ||
              "未知用户"}
          </p>
          <p className="text-xs text-gray-400 font-light shrink-0">
            {format(new Date(message.createdAt), "PP p")}
          </p>
        </div>
        <p className="text-xs text-gray-400 truncate">
          {getConversationTitle(conversation, currentUserEmail)}
        </p>
        <div className="mt-1 text-sm text-gray-700 break-words">
          {isImage ? (
            <span className="inline-flex items-center gap-1.5 text-gray-500 italic">
              <HiPhoto className="h-4 w-4" />
              [图片消息]
            </span>
          ) : (
            segments.map((segment, index) =>
              segment.match ? (
                <mark
                  key={index}
                  className="bg-yellow-200 text-gray-900 rounded-sm px-0.5"
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchResultRow;
