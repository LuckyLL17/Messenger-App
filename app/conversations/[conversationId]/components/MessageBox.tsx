"use client";

import Avatar from "@/app/components/Avatar";
import { FullMessageType } from "@/app/types";
import { ALLOWED_REACTIONS } from "@/app/libs/reactions";
import clsx from "clsx";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import Image from "next/image";
import axios from "axios";
import toast from "react-hot-toast";
import { useMemo, useState } from "react";
import { HiOutlineFaceSmile } from "react-icons/hi2";
import { User } from "@prisma/client";

interface MessageBoxProps {
    data: FullMessageType;
    isLast?: boolean;
    onUpdate?: (message: FullMessageType) => void;
}

interface ReactionGroup {
    emoji: string;
    users: User[];
}

const MessageBox: React.FC<MessageBoxProps> = ({ data, isLast, onUpdate }) => {
    const session = useSession();
    const [pickerOpen, setPickerOpen] = useState(false);
    const currentEmail = session?.data?.user?.email;
    const isOwn = currentEmail === data?.sender?.email;
    const seenList = (data.seen || [])
        .filter((user) => user.email !== data?.sender?.email)
        .map((user) => user.name)
        .join(", ");

    const reactionGroups = useMemo<ReactionGroup[]>(() => {
        const groups: ReactionGroup[] = [];
        (data.reactions || []).forEach((reaction) => {
            const group = groups.find((g) => g.emoji === reaction.emoji);
            if (group) {
                group.users.push(reaction.user);
            } else {
                groups.push({ emoji: reaction.emoji, users: [reaction.user] });
            }
        });
        return groups;
    }, [data.reactions]);

    const toggleReaction = async (emoji: string) => {
        setPickerOpen(false);
        try {
            const response = await axios.post(
                `/api/messages/${data.id}/reactions`,
                { emoji }
            );
            // Apply the server's converged state locally right away;
            // other online users receive it through the message:update broadcast.
            onUpdate?.(response.data);
        } catch {
            toast.error("Something went wrong");
        }
    };

    const container = clsx("flex gap-3 p-4", isOwn && "justify-end");
    const avatar = clsx(isOwn && "order-2");
    const body = clsx("flex flex-col gap-2", isOwn && "items-end");
    const message = clsx(
        "text-sm w-fit overflow-hidden",
        isOwn ? "bg-violet-500 text-white shadow-sm" : "bg-gray-100 shadow-sm",
        data.image ? "rounded-md p-0" : "rounded-full py-2 px-3"
    );

    return (
        <div className={container}>
            <div className={avatar}>
                <Avatar user={data.sender} />
            </div>
            <div className={body}>
                <div className="flex items-center gap-1">
                    <div className="text-sm text-gray-500">{data.sender.name}</div>
                    <div className="text-xs text-gray-400">
                        {format(new Date(data.createdAt), "p")}
                    </div>
                </div>
                <div
                    className={clsx(
                        "relative flex items-center gap-1 group",
                        isOwn && "flex-row-reverse"
                    )}
                >
                    <div className={message}>
                        {data.image ? (
                            <Image
                                alt="Image"
                                height="288"
                                width="288"
                                src={data.image}
                                className="object-cover cursor-pointer hover:scale-110 transition translate"
                            />
                        ) : (
                            <div>{data.body}</div>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Add reaction"
                        onClick={() => setPickerOpen((open) => !open)}
                        className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-200"
                    >
                        <HiOutlineFaceSmile size={18} />
                    </button>
                    {pickerOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={() => setPickerOpen(false)}
                            />
                            <div
                                className={clsx(
                                    "absolute bottom-full mb-1 z-20 flex gap-1 bg-white rounded-full shadow-md border border-gray-200 px-2 py-1",
                                    isOwn ? "right-0" : "left-0"
                                )}
                            >
                                {ALLOWED_REACTIONS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => toggleReaction(emoji)}
                                        className="text-lg hover:scale-125 transition"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                {reactionGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {reactionGroups.map((group) => {
                            const reactedByMe = group.users.some(
                                (user) => user.email === currentEmail
                            );
                            const names = group.users
                                .map((user) =>
                                    user.email === currentEmail
                                        ? "You"
                                        : user.name || user.email
                                )
                                .join(", ");
                            return (
                                <div
                                    key={group.emoji}
                                    className="relative group/badge"
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleReaction(group.emoji)}
                                        className={clsx(
                                            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition",
                                            reactedByMe
                                                ? "bg-violet-100 border-violet-400 text-violet-700"
                                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                        )}
                                    >
                                        <span>{group.emoji}</span>
                                        <span className="font-medium">
                                            {group.users.length}
                                        </span>
                                    </button>
                                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover/badge:block whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white shadow-lg z-20">
                                        {names}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {isLast && isOwn && seenList.length > 0 && (
                    <div className="text-xs font-light text-gray-500">{`Seen by ${seenList}`}</div>
                )}
            </div>
        </div>
    );
};

export default MessageBox;
