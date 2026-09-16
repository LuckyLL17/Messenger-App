"use client";

import { FullMessageType } from "@/app/types";
import { useState, useRef, useEffect, useCallback } from "react";
import MessageBox from "./MessageBox";
import useConversation from "@/app/hooks/useConversation";
import { pusherClient } from "@/app/libs/pusher";
import { find } from "lodash";
import axios from "axios";

interface BodyProps {
    initialMessages: FullMessageType[];
}

const Body: React.FC<BodyProps> = ({ initialMessages = [] }) => {
    const [messages, setMessages] = useState(initialMessages);
    const bottomRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<FullMessageType[]>(initialMessages);
    const { conversationId } = useConversation();

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // 只有标签页可见（用户真正在看）时才上报已读，
    // 并带上本次渲染到的最后一条消息，服务端只清除到该消息为止。
    const markSeen = useCallback((lastMessageId?: string) => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
            return;
        }

        const seenUpTo =
            lastMessageId ??
            messagesRef.current[messagesRef.current.length - 1]?.id;

        axios.post(`/api/conversations/${conversationId}/seen`, {
            lastMessageId: seenUpTo,
        });
    }, [conversationId]);

    useEffect(() => {
        markSeen();

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                markSeen();
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("focus", handleVisibility);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("focus", handleVisibility);
        };
    }, [conversationId, markSeen]);

    useEffect(() => {
        pusherClient.subscribe(conversationId);
        bottomRef?.current?.scrollIntoView();

        const messageHandler = (message: FullMessageType) => {
            setMessages((current) => {
                if (find(current, { id: message.id })) {
                    return current;
                }
                return [...current, message];
            });

            // 标签页不可见时 markSeen 会直接返回，新消息保持未读并计入未读数
            markSeen(message.id);
            bottomRef?.current?.scrollIntoView();
        };

        const updateMessageHandler = (newMessage: FullMessageType) => {
            setMessages((current) => current.map((currentMessage) => {
                if (currentMessage.id === newMessage.id) {
                    return newMessage;
                }
                return currentMessage;
            }));
        };

        pusherClient.bind("messages:new", messageHandler);
        pusherClient.bind("message:update", updateMessageHandler);

        return () => {
            pusherClient.unsubscribe(conversationId);
            pusherClient.unbind("messages:new", messageHandler);
            pusherClient.unbind("message:update", updateMessageHandler);
        };
    }, [conversationId, markSeen]);

    return (
        <div className="flex-1 overflow-y-auto bg-neutral-100">
            {messages.map((message, i) => (
                <MessageBox
                    isLast={i === messages.length - 1}
                    key={message.id}
                    data={message}
                />
            ))}
            <div className="pt-24" ref={bottomRef} />
        </div>
    );
};

export default Body;
