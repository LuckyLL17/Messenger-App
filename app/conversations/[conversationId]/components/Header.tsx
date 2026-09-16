"use client";

import useOtherUser from "@/app/hooks/useOtherUser";
import { Conversation, User } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HiChevronLeft } from "react-icons/hi";
import Avatar from "@/app/components/Avatar";
import AvatarGroup from "@/app/components/AvatarGroup";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import { pusherClient } from "@/app/libs/pusher";
import { FullConversationType } from "@/app/types";
import ProfileDrawer from "./ProfileDrawer";

interface HeaderProps {
    conversation: Conversation & {
        users: User[];
    };
    users: User[];
}

const Header: React.FC<HeaderProps> = ({ conversation, users }) => {
    const [conversationData, setConversationData] = useState(conversation);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const otherUser = useOtherUser(conversationData);

    useEffect(() => {
        setConversationData(conversation);
    }, [conversation]);

    useEffect(() => {
        const updateHandler = (newData: FullConversationType) => {
            if (newData.id === conversation.id) {
                setConversationData((current) => ({
                    ...current,
                    ...newData,
                }));
            }
        };

        pusherClient.subscribe(conversation.id);
        pusherClient.bind("conversation:update", updateHandler);

        return () => {
            pusherClient.unbind("conversation:update", updateHandler);
        };
    }, [conversation.id]);

    const statusText = useMemo(() => {
        if (conversationData.isGroup) {
            return `${conversationData.users.length} members`;
        }

        return "Active";
    }, [conversationData]);

    const title = conversationData.name || otherUser.map((user) => user.name).join(", ");

    return (
        <>
            <ProfileDrawer
                conversation={conversationData}
                users={users}
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
            />
            <div className="bg-white w-full flex border-b-[1px] sm:px-4 py-3 px-4 lg:px-6 justify-between items-center shadow-sm">
                <div className="flex gap-3 items-center">
                    <Link
                        href="/conversations"
                        className="lg:hidden block text-violet-500 hover:text-violet-600 transition cursor-pointer"
                    >
                        <HiChevronLeft size={32} />
                    </Link>
                    {conversationData.isGroup ? (
                        <AvatarGroup users={conversationData.users} />
                    ) : (
                        <Avatar user={otherUser[0]} />
                    )}
                    <div className="flex flex-col">
                        <div>{title}</div>
                        <div className="text-sm font-light text-neutral-500">
                            {statusText}
                        </div>
                    </div>
                </div>
                <HiEllipsisHorizontal
                    size={32}
                    onClick={() => setDrawerOpen(true)}
                    className="text-violet-500 cursor-pointer hover:text-violet-600 transition"
                />
            </div>
        </>
    );
};

export default Header;
