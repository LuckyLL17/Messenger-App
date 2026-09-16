"use client"

import { User } from "@prisma/client"
import Image from "next/image"
import clsx from "clsx"

import { useUserStatus } from "@/app/hooks/usePresence"
import { PresenceStatus } from "@/app/libs/presence"

interface AvatarProps {
    user?: User
}

const statusColorMap: Record<PresenceStatus, string> = {
    online: "bg-green-500",
    away: "bg-amber-400",
    offline: "bg-gray-300",
}

const statusLabelMap: Record<PresenceStatus, string> = {
    online: "Online",
    away: "Away",
    offline: "Offline",
}

const Avatar = ({ user }: AvatarProps) => {
    const status = useUserStatus(user?.email);

    return (
        <div className="relative">
            <div className="
             relative
             inline-block
             rounded-full
             overflow-hidden
             h-9
             w-9
             md:h-11
             md:w-11
            ">
                <Image
                    alt="Avatar"
                    src={user?.image || "/images/placeholder.jpg"}
                    fill
                />
            </div>
            <span
                title={statusLabelMap[status]}
                className={clsx(`
            absolute
            block
            rounded-full
            ring-2
            ring-white
            top-0
            right-0
            h-2
            w-2
            md:h-3
            md:w-3`, statusColorMap[status])} />
        </div>
    )
}

export default Avatar
