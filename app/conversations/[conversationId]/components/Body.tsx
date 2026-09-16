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
    highlightMessageId?: string;
}

const Body: React.FC<BodyProps> = ({
    initialMessages = [],
    highlightMessageId,
}) => {
    const [messages, setMessages] = useState(initialMessages);
    const bottomRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const scrolledToRef = useRef<string | null>(null);
    const { conversationId } = useConversation();

    const setMessageRef = useCallback(
        (id: string) => (element: HTMLDivElement | null) => {
            if (element) {
                messageRefs.current.set(id, element);
            } else {
                messageRefs.current.delete(id);
            }
        },
        [],
    );

    useEffect(() => {
        axios.post(`/api/conversations/${conversationId}/seen`);
    }, [conversationId]);

    // Scroll to the deep-linked search result (and let MessageBox flash it).
    useEffect(() => {
        if (
            highlightMessageId &&
            scrolledToRef.current !== highlightMessageId
        ) {
            const element = messageRefs.current.get(highlightMessageId);
            if (element) {
                element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
                scrolledToRef.current = highlightMessageId;
            }
        }
    }, [highlightMessageId, messages]);

    useEffect(() => {
        pusherClient.subscribe(conversationId);

        // When arriving from a search result, the highlight effect owns the
        // initial scroll position instead of jumping to the newest message.
        if (!highlightMessageId) {
            bottomRef?.current?.scrollIntoView();
        }

        const messageHandler = (message: FullMessageType) => {
            axios.post(`/api/conversations/${conversationId}/seen`);

            setMessages((current) => {
                if (find(current, { id: message.id })) {
                    return current;
                }
                return [...current, message];
            });
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
    }, [conversationId, highlightMessageId]);

    return (
        <div className="flex-1 overflow-y-auto bg-neutral-100">
            {messages.map((message, i) => (
                <div
                    key={message.id}
                    ref={setMessageRef(message.id)}
                    data-message-id={message.id}
                >
                    <MessageBox
                        key={
                            message.id === highlightMessageId
                                ? `${message.id}-highlighted`
                                : message.id
                        }
                        isLast={i === messages.length - 1}
                        data={message}
                        isHighlighted={message.id === highlightMessageId}
                    />
                </div>
            ))}
            <div className="pt-24" ref={bottomRef} />
        </div>
    );
};

export default Body;
