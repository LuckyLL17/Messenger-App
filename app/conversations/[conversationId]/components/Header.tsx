"use client";

import useOtherUser from "@/app/hooks/useOtherUser";
import { Conversation, User } from "@prisma/client";
import { useMemo } from "react";
import Link from "next/link";
import { HiChevronLeft } from "react-icons/hi";
import Avatar from "@/app/components/Avatar";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import { getPresenceStatus, usePresenceMap } from "@/app/hooks/usePresence";

interface HeaderProps {
    conversation: Conversation & {
        users: User[];
    };
}

const Header: React.FC<HeaderProps> = ({ conversation }) => {
    const otherUser = useOtherUser(conversation);
    const presenceMap = usePresenceMap();

    const statusText = useMemo(() => {
        if (conversation.isGroup) {
            const onlineCount = conversation.users.filter(
                (user) => getPresenceStatus(presenceMap, user.email) === "online",
            ).length;

            return onlineCount > 0
                ? `${conversation.users.length} members, ${onlineCount} online`
                : `${conversation.users.length} members`;
        }

        const status = getPresenceStatus(presenceMap, otherUser[0]?.email);

        if (status === "online") {
            return "Active now";
        }

        if (status === "away") {
            return "Away";
        }

        return "Offline";
    }, [conversation, otherUser, presenceMap]);

    return (
        <>
            <div className="bg-white w-full flex border-b-[1px] sm:px-4 py-3 px-4 lg:px-6 justify-between items-center shadow-sm">
                <div className="flex gap-3 items-center">
                    <Link
                        href="/conversations"
                        className="lg:hidden block text-violet-500 hover:text-violet-600 transition cursor-pointer"
                    >
                        <HiChevronLeft size={32} />
                    </Link>
                    <Avatar user={otherUser[0]} />
                    <div className="flex flex-col">
                        <div>{conversation.name || otherUser[0]?.name}</div>
                        <div className="text-sm font-light text-neutral-500">
                            {statusText}
                        </div>
                    </div>
                </div>
                <HiEllipsisHorizontal
                    size={32}
                    onClick={() => { }}
                    className="text-violet-500 cursor-pointer hover:text-violet-600 transition"
                />
            </div>
        </>
    );
};

export default Header;
