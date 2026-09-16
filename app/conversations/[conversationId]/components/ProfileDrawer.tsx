"use client";

import { Conversation, ConversationMemberEvent, User } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { format } from "date-fns";
import { IoClose, IoTrash } from "react-icons/io5";
import { MdOutlineGroupAdd } from "react-icons/md";
import { FiLogOut } from "react-icons/fi";

import Avatar from "@/app/components/Avatar";
import AvatarGroup from "@/app/components/AvatarGroup";
import useOtherUser from "@/app/hooks/useOtherUser";
import AddMemberModal from "./AddMemberModal";

type MemberEventWithUsers = ConversationMemberEvent & {
    actor: User;
    target: User | null;
};

interface ProfileDrawerProps {
    conversation: Conversation & {
        users: User[];
    };
    users: User[];
    isOpen: boolean;
    onClose: () => void;
}

const eventLabel = (event: MemberEventWithUsers) => {
    const actorName = event.actor?.name || "Someone";
    const targetName = event.target?.name || "someone";

    switch (event.type) {
        case "MEMBER_ADDED":
            return `${actorName} added ${targetName}`;
        case "MEMBER_REMOVED":
            return `${actorName} removed ${targetName}`;
        case "MEMBER_LEFT":
            return `${actorName} left the group`;
        case "OWNER_TRANSFERRED":
            return `${targetName} became the group owner`;
        default:
            return "Member change";
    }
};

const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
    conversation,
    users,
    isOpen,
    onClose,
}) => {
    const router = useRouter();
    const session = useSession();
    const otherUser = useOtherUser(conversation);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [events, setEvents] = useState<MemberEventWithUsers[]>([]);

    const currentUser = useMemo(() => {
        const email = session.data?.user?.email;
        return conversation.users.find((user) => user.email === email);
    }, [session.data?.user?.email, conversation.users]);

    const isOwner = Boolean(currentUser && conversation.ownerId === currentUser.id);

    const addableUsers = useMemo(() => {
        const memberIds = new Set(conversation.users.map((user) => user.id));
        return users.filter((user) => !memberIds.has(user.id));
    }, [users, conversation.users]);

    useEffect(() => {
        if (!isOpen || !conversation.isGroup) {
            return;
        }

        axios
            .get(`/api/conversations/${conversation.id}/members`)
            .then((response) => setEvents(response.data))
            .catch(() => setEvents([]));
    }, [isOpen, conversation.id, conversation.isGroup, conversation.users.length]);

    const handleRemove = (memberId: string) => {
        setIsLoading(true);

        axios
            .delete(`/api/conversations/${conversation.id}/members`, {
                data: { memberId },
            })
            .then((response) => {
                if (response.data?.dissolved) {
                    toast.success("Group dissolved");
                } else {
                    toast.success("Member removed");
                }
                router.refresh();
            })
            .catch((error) => {
                const message = error?.response?.data;
                toast.error(typeof message === "string" ? message : "Something went wrong");
            })
            .finally(() => setIsLoading(false));
    };

    const handleLeave = () => {
        if (!currentUser) {
            return;
        }

        setIsLoading(true);

        axios
            .delete(`/api/conversations/${conversation.id}/members`, {
                data: { memberId: currentUser.id },
            })
            .then(() => {
                toast.success("You left the group");
                onClose();
                router.push("/conversations");
                router.refresh();
            })
            .catch((error) => {
                const message = error?.response?.data;
                toast.error(typeof message === "string" ? message : "Something went wrong");
            })
            .finally(() => setIsLoading(false));
    };

    if (!isOpen) {
        return null;
    }

    const title = conversation.name || otherUser.map((user) => user.name).join(", ");

    return (
        <>
            <AddMemberModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                conversationId={conversation.id}
                users={addableUsers}
            />
            <div className="relative z-40">
                <div
                    className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                    onClick={onClose}
                />
                <div className="fixed inset-0 overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                            <div className="pointer-events-auto w-screen max-w-md bg-white shadow-xl flex flex-col overflow-y-auto">
                                <div className="px-4 py-6 sm:px-6 flex items-start justify-between">
                                    <h2 className="text-base font-semibold leading-6 text-gray-900">
                                        {conversation.isGroup ? "Group info" : "Conversation info"}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                                    >
                                        <span className="sr-only">Close panel</span>
                                        <IoClose className="h-6 w-6" />
                                    </button>
                                </div>

                                <div className="relative flex-1 px-4 sm:px-6 pb-6">
                                    <div className="flex flex-col items-center">
                                        {conversation.isGroup ? (
                                            <AvatarGroup users={conversation.users} />
                                        ) : (
                                            <Avatar user={otherUser[0]} />
                                        )}
                                        <div className="mt-2 text-lg font-medium text-gray-900">
                                            {title}
                                        </div>
                                        {conversation.isGroup && (
                                            <div className="text-sm text-gray-500">
                                                {conversation.users.length} members
                                            </div>
                                        )}
                                    </div>

                                    {conversation.isGroup && (
                                        <>
                                            <div className="mt-6 flex justify-center gap-6">
                                                {isOwner && (
                                                    <button
                                                        type="button"
                                                        disabled={isLoading}
                                                        onClick={() => setIsAddModalOpen(true)}
                                                        className="flex flex-col items-center gap-1 text-gray-600 hover:text-violet-600 transition disabled:opacity-50"
                                                    >
                                                        <span className="rounded-full bg-gray-100 p-2">
                                                            <MdOutlineGroupAdd size={20} />
                                                        </span>
                                                        <span className="text-xs">Add</span>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled={isLoading}
                                                    onClick={handleLeave}
                                                    className="flex flex-col items-center gap-1 text-gray-600 hover:text-rose-600 transition disabled:opacity-50"
                                                >
                                                    <span className="rounded-full bg-gray-100 p-2">
                                                        <FiLogOut size={20} />
                                                    </span>
                                                    <span className="text-xs">Leave</span>
                                                </button>
                                            </div>

                                            <div className="mt-8">
                                                <h3 className="text-sm font-medium text-gray-900">
                                                    Members
                                                </h3>
                                                <ul className="mt-3 divide-y divide-gray-100">
                                                    {conversation.users.map((user) => (
                                                        <li
                                                            key={user.id}
                                                            className="flex items-center justify-between py-3"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <Avatar user={user} />
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium text-gray-900">
                                                                        {user.name}
                                                                    </span>
                                                                    {conversation.ownerId === user.id && (
                                                                        <span className="text-xs text-violet-500">
                                                                            Group owner
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {isOwner && user.id !== conversation.ownerId && (
                                                                <button
                                                                    type="button"
                                                                    disabled={isLoading}
                                                                    onClick={() => handleRemove(user.id)}
                                                                    className="text-gray-400 hover:text-rose-600 transition disabled:opacity-50"
                                                                >
                                                                    <span className="sr-only">
                                                                        Remove {user.name}
                                                                    </span>
                                                                    <IoTrash size={18} />
                                                                </button>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            <div className="mt-8">
                                                <h3 className="text-sm font-medium text-gray-900">
                                                    Activity
                                                </h3>
                                                {events.length === 0 ? (
                                                    <p className="mt-3 text-sm text-gray-400">
                                                        No member changes yet.
                                                    </p>
                                                ) : (
                                                    <ul className="mt-3 space-y-3">
                                                        {events.map((event) => (
                                                            <li
                                                                key={event.id}
                                                                className="flex items-center justify-between gap-3"
                                                            >
                                                                <span className="text-sm text-gray-600">
                                                                    {eventLabel(event)}
                                                                </span>
                                                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                                                    {format(new Date(event.createdAt), "MMM d, p")}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProfileDrawer;
