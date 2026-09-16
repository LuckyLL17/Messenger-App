"use client"
import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import useConversation from "@/app/hooks/useConversation"
import { useSession } from "next-auth/react"
import clsx from "clsx"
import { pusherClient } from "@/app/libs/pusher"
import { find } from "lodash"
import { MdOutlineGroupAdd } from "react-icons/md"
import { ConversationBox } from "./ConversationBox"
import { ConversationUpdatePayload, FullConversationType } from "@/app/types"
import GroupChatModal from "./GroupChatModal"
import { User } from "@prisma/client"

interface ConversationListProps {
    initialItems: FullConversationType[];
    users: User[];
}

interface UnreadInfo {
    count: number;
    mentions: number;
}

const BASE_TITLE = "Messenger APP";

// 从会话自带的消息列表派生未读/提及数（用于服务端未下发计数的事件，如 conversation:new）
const deriveUnread = (conversation: FullConversationType, userId?: string): UnreadInfo => {
    if (!userId) {
        return { count: 0, mentions: 0 };
    }

    let count = 0;
    let mentions = 0;

    (conversation.messages || []).forEach((message) => {
        if (message.senderId === userId) {
            return;
        }
        if (message.seenIds?.includes(userId)) {
            return;
        }

        count += 1;
        if (message.mentionedIds?.includes(userId)) {
            mentions += 1;
        }
    });

    return { count, mentions };
};

const ConversationList = ({ initialItems, users }: ConversationListProps) => {
    const [items, setItems] = useState(initialItems)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [unreadMap, setUnreadMap] = useState<Record<string, UnreadInfo>>(() => {
        const map: Record<string, UnreadInfo> = {};
        initialItems.forEach((item) => {
            map[item.id] = {
                count: item.unreadCount ?? 0,
                mentions: item.mentionCount ?? 0,
            };
        });
        return map;
    });

    const router = useRouter()

    const { isOpen, conversationId } = useConversation()
    const session = useSession();

    const pusherKey = useMemo(() => {
        return session.data?.user?.email;
    }, [session.data?.user?.email]);

    const userId = session.data?.user?.id;

    useEffect(() => {
        if (!pusherKey) {
            return;
        }

        pusherClient.subscribe(pusherKey);

        const newHandler = (conversation: FullConversationType) => {
            setItems((current) => {
                if (find(current, { id: conversation.id })) {
                    return current;
                }

                return [conversation, ...current];
            });

            setUnreadMap((current) => ({
                ...current,
                [conversation.id]: deriveUnread(conversation, userId),
            }));
        };

        const updateHandler = (payload: ConversationUpdatePayload) => {
            setItems((current) => current.map((currentConversation) => {
                if (currentConversation.id === payload.id) {
                    return {
                        ...currentConversation,
                        messages: payload.messages
                    };
                }

                return currentConversation;
            }));

            // 服务端随事件下发的是权威计数，直接采用而不是自行 +1，
            // 多标签页/重复事件下不会重复累加
            if (typeof payload.unreadCount === "number") {
                setUnreadMap((current) => ({
                    ...current,
                    [payload.id]: {
                        count: payload.unreadCount ?? 0,
                        mentions: payload.mentionCount ?? 0,
                    },
                }));
            }
        };

        const removeHandler = (conversation: FullConversationType) => {
            setItems((current) => {
                return [...current.filter((convo) => convo.id !== conversation.id)]
            });

            setUnreadMap((current) => {
                const next = { ...current };
                delete next[conversation.id];
                return next;
            });

            if (conversationId === conversation.id) {
                router.push('/conversations');
            }
        };

        pusherClient.bind('conversation:new', newHandler);
        pusherClient.bind('conversation:update', updateHandler);
        pusherClient.bind('conversation:remove', removeHandler);

        return () => {
            pusherClient.unsubscribe(pusherKey);
            pusherClient.unbind('conversation:new', newHandler);
            pusherClient.unbind('conversation:update', updateHandler);
            pusherClient.unbind('conversation:remove', removeHandler);
        }
    }, [pusherKey, conversationId, router, userId]);

    const { totalUnread, totalMentions } = useMemo(() => {
        return Object.values(unreadMap).reduce(
            (acc, info) => ({
                totalUnread: acc.totalUnread + info.count,
                totalMentions: acc.totalMentions + info.mentions,
            }),
            { totalUnread: 0, totalMentions: 0 },
        );
    }, [unreadMap]);

    // 页面标题与侧边栏徽标使用同一份计数数据，统一展示
    useEffect(() => {
        const parts: string[] = [];
        if (totalUnread > 0) {
            parts.push(`(${totalUnread})`);
        }
        if (totalMentions > 0) {
            parts.push(`(@${totalMentions})`);
        }

        document.title = [...parts, BASE_TITLE].join(" ");

        return () => {
            document.title = BASE_TITLE;
        };
    }, [totalUnread, totalMentions]);

    return (
        <>
            <GroupChatModal
                users={users}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
            <aside
                className={clsx(`
            fixed
            inset-y-0
            pb-20
            lg:pb-0
            lg:left-20
            lg:w-80
            lg:block
            overflow-y-auto
            border-r
            border-gray-200
            `, isOpen ? "hidden" : "block w-full left-0")}
            >
                <div className="px-5">
                    <div className="flex justify-between mb-4 pt-4">
                        <div className="text-2xl font-bold text-neutral-800">Messages</div>
                        <div
                            onClick={() => setIsModalOpen(true)}
                            className="rounded-full
                    p-2
                    bg-gray-100
                    text-gray-600
                    cursor-pointer
                    hover:opacity-75
                    transition
                    " >
                            <MdOutlineGroupAdd size={20} color="gray" />
                        </div>
                    </div>
                    {items.map((item) => (
                        <ConversationBox
                            key={item.id}
                            data={item}
                            selected={conversationId === item.id}
                            unreadCount={unreadMap[item.id]?.count ?? 0}
                            mentionCount={unreadMap[item.id]?.mentions ?? 0}
                        />
                    ))}
                </div>
            </aside>
        </>
    )
}

export default ConversationList
