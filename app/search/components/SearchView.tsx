"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { useSession } from "next-auth/react";

import Avatar from "@/app/components/Avatar";
import { SearchParticipant } from "@/app/actions/getSearchParticipants";
import { SearchGroupType, SearchResponseType } from "@/app/types";
import SearchResultRow from "./SearchResultRow";

interface SearchViewProps {
  currentUser:
    | { id: string; name: string | null; email: string | null }
    | null;
  participants: SearchParticipant[];
}

const MIN_KEYWORD_LENGTH = 2;
const DEBOUNCE_MS = 350;

type SearchStatus =
  | "idle"
  | "tooShort"
  | "loading"
  | "success"
  | "error";

const SearchView: React.FC<SearchViewProps> = ({
  currentUser,
  participants,
}) => {
  const session = useSession();
  const currentUserEmail =
    session.data?.user?.email || currentUser?.email;

  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [senderId, setSenderId] = useState("");
  const [groups, setGroups] = useState<SearchGroupType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [loadingMore, setLoadingMore] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  // Debounce keyword input so typing "hello" doesn't fire 5 requests.
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(keywordInput.trim());
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [keywordInput]);

  const runSearch = useCallback(
    async (
      searchKeyword: string,
      searchSenderId: string,
      targetPage: number,
      append: boolean,
    ) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestSeq = ++requestSeqRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setStatus("loading");
      }

      try {
        const params: Record<string, string | number> = {
          page: targetPage,
        };

        if (searchKeyword) {
          params.keyword = searchKeyword;
        }
        if (searchSenderId) {
          params.senderId = searchSenderId;
        }

        const response = await axios.get<SearchResponseType>("/api/search", {
          params,
          signal: controller.signal,
        });

        // Ignore responses from a superseded request.
        if (requestSeq !== requestSeqRef.current) {
          return;
        }

        setGroups((current) =>
          append ? mergeGroups(current, response.data.groups) : response.data.groups,
        );
        setTotal(response.data.total);
        setPage(response.data.page);
        setHasMore(response.data.hasMore);
        setStatus("success");
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) {
          return;
        }
        if (requestSeq !== requestSeqRef.current) {
          return;
        }
        if (!append) {
          setGroups([]);
          setTotal(0);
          setHasMore(false);
        }
        setStatus("error");
      } finally {
        if (requestSeq === requestSeqRef.current) {
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Fire a new search whenever the debounced keyword or sender changes.
  useEffect(() => {
    const isTooShort =
      keyword.length > 0 && keyword.length < MIN_KEYWORD_LENGTH;
    const hasFilter = keyword.length >= MIN_KEYWORD_LENGTH || !!senderId;

    if (isTooShort) {
      abortControllerRef.current?.abort();
      setGroups([]);
      setTotal(0);
      setHasMore(false);
      setStatus("tooShort");
      return;
    }

    if (!hasFilter) {
      abortControllerRef.current?.abort();
      setGroups([]);
      setTotal(0);
      setHasMore(false);
      setStatus("idle");
      return;
    }

    runSearch(keyword, senderId, 1, false);
  }, [keyword, senderId, runSearch]);

  const handleLoadMore = useCallback(() => {
    runSearch(keyword, senderId, page + 1, true);
  }, [keyword, senderId, page, runSearch]);

  const senderOptions = useMemo(
    () =>
      participants.map((participant) => ({
        value: participant.id,
        label: participant.name || participant.email || "未知用户",
      })),
    [participants],
  );

  const resultCount = groups.reduce(
    (sum, group) => sum + group.messages.length,
    0,
  );

  return (
    <div className="bg-white h-full flex flex-col pb-20 lg:pb-0">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">搜索消息</h1>
        <p className="mt-1 text-sm text-gray-500">
          在你参与过的所有会话中，按关键词或发送者查找消息。
        </p>

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <HiMagnifyingGlass
              className="
                absolute
                left-3
                top-1/2
                -translate-y-1/2
                h-5
                w-5
                text-gray-400
                pointer-events-none
              "
            />
            <input
              type="text"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder={`输入至少 ${MIN_KEYWORD_LENGTH} 个字符的关键词`}
              className="
                form-input
                w-full
                rounded-full
                border-0
                py-2
                pl-10
                pr-4
                text-sm
                text-gray-900
                shadow-sm
                ring-1
                ring-inset
                ring-gray-300
                placeholder:text-gray-400
                focus:ring-2
                focus:ring-inset
                focus:ring-violet-600
              "
            />
          </div>

          <select
            value={senderId}
            onChange={(event) => setSenderId(event.target.value)}
            className="
              form-select
              rounded-full
              border-0
              py-2
              pl-4
              pr-8
              text-sm
              text-gray-900
              shadow-sm
              ring-1
              ring-inset
              ring-gray-300
              focus:ring-2
              focus:ring-inset
              focus:ring-violet-600
              sm:min-w-44
            "
          >
            <option value="">全部发送者</option>
            {senderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-neutral-50">
        {status === "idle" && (
          <FeedbackPanel>
            <HiMagnifyingGlass className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              输入关键词，或选择一位发送者开始搜索。
            </p>
          </FeedbackPanel>
        )}

        {status === "tooShort" && (
          <FeedbackPanel>
            <p className="text-sm font-medium text-amber-700">关键词过短</p>
            <p className="mt-1 text-sm text-gray-500">
              请至少输入 {MIN_KEYWORD_LENGTH} 个字符后再搜索（当前{" "}
              {keyword.length} 个字符）。
            </p>
          </FeedbackPanel>
        )}

        {status === "loading" && (
          <FeedbackPanel>
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent"
              aria-label="加载中"
            />
            <p className="mt-3 text-sm text-gray-500">正在搜索…</p>
          </FeedbackPanel>
        )}

        {status === "error" && (
          <FeedbackPanel>
            <p className="text-sm font-medium text-red-700">搜索失败</p>
            <p className="mt-1 text-sm text-gray-500">
              搜索过程中出现问题，请稍后重试。
            </p>
          </FeedbackPanel>
        )}

        {status === "success" && resultCount === 0 && (
          <FeedbackPanel>
            <HiMagnifyingGlass className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">
              没有找到匹配的消息
            </p>
            <p className="mt-1 text-sm text-gray-500">
              试试其他关键词，或更换发送者筛选条件。
            </p>
          </FeedbackPanel>
        )}

        {status === "success" && resultCount > 0 && (
          <div className="space-y-6">
            <p className="text-xs text-gray-500">
              共找到 {total} 条匹配消息
              {hasMore || resultCount < total
                ? `，当前显示最早加载的 ${resultCount} 条`
                : ""}
              。
            </p>

            {groups.map((group) => (
              <section
                key={group.conversation.id}
                className="bg-white rounded-xl shadow-sm overflow-hidden"
              >
                <header
                  className="
                    flex
                    items-center
                    gap-3
                    px-4
                    py-3
                    border-b
                    border-gray-100
                    bg-gray-50
                  "
                >
                  {group.conversation.isGroup ? (
                    <div className="h-9 w-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-sm font-semibold shrink-0">
                      {(getConversationLabel(
                        group.conversation,
                        currentUserEmail,
                      ).slice(0, 1) || "群").toUpperCase()}
                    </div>
                  ) : (
                    <Avatar
                      user={
                        group.conversation.users.find(
                          (user) => user.email !== currentUserEmail,
                        ) || null
                      }
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {getConversationLabel(
                        group.conversation,
                        currentUserEmail,
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {group.messages.length} 条命中
                    </p>
                  </div>
                </header>
                <div className="divide-y divide-gray-50">
                  {group.messages.map((message) => (
                    <SearchResultRow
                      key={message.id}
                      conversation={group.conversation}
                      message={message}
                      keyword={keyword}
                      currentUserEmail={currentUserEmail}
                    />
                  ))}
                </div>
              </section>
            ))}

            {hasMore && (
              <div className="flex flex-col items-center gap-2 py-4">
                <p className="text-xs text-gray-500">
                  消息数据量较大，仅加载了首批 {resultCount} 条结果（共{" "}
                  {total} 条）。
                </p>
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="
                    rounded-full
                    bg-violet-500
                    px-5
                    py-2
                    text-sm
                    font-medium
                    text-white
                    shadow-sm
                    hover:bg-violet-600
                    disabled:opacity-50
                    disabled:cursor-not-allowed
                    transition
                  "
                >
                  {loadingMore ? "加载中…" : "加载下一批结果"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const FeedbackPanel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="h-full min-h-48 flex flex-col items-center justify-center text-center py-16">
    {children}
  </div>
);

// Merge an additional page of groups into the already rendered groups,
// de-duplicating both sections and messages within a section.
function mergeGroups(
  existing: SearchGroupType[],
  incoming: SearchGroupType[],
): SearchGroupType[] {
  const map = new Map<string, SearchGroupType>();

  existing.forEach((group) => {
    map.set(group.conversation.id, {
      conversation: group.conversation,
      messages: [...group.messages],
    });
  });

  incoming.forEach((group) => {
    const current = map.get(group.conversation.id);

    if (!current) {
      map.set(group.conversation.id, {
        conversation: group.conversation,
        messages: [...group.messages],
      });
      return;
    }

    const knownIds = new Set(current.messages.map((message) => message.id));
    group.messages.forEach((message) => {
      if (!knownIds.has(message.id)) {
        current.messages.push(message);
      }
    });
  });

  return Array.from(map.values());
}

function getConversationLabel(
  conversation: SearchGroupType["conversation"],
  currentUserEmail?: string | null,
) {
  if (conversation.name) {
    return conversation.name;
  }

  const otherUser = conversation.users.find(
    (user) => user.email !== currentUserEmail,
  );

  return otherUser?.name || otherUser?.email || "未知会话";
}

export default SearchView;
