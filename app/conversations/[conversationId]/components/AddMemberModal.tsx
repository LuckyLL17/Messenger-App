"use client";

import { User } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";

import Modal from "@/app/components/Modal";
import Select from "@/app/components/inputs/Select";
import Button from "@/app/components/Button";

interface AddMemberModalProps {
    isOpen?: boolean;
    onClose: () => void;
    conversationId: string;
    users: User[];
}

const AddMemberModal: React.FC<AddMemberModalProps> = ({
    isOpen,
    onClose,
    conversationId,
    users,
}) => {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState<Record<string, any>[]>([]);

    const onSubmit = () => {
        if (selected.length === 0) {
            return;
        }

        setIsLoading(true);

        axios
            .post(`/api/conversations/${conversationId}/members`, {
                memberIds: selected.map((option) => option.value),
            })
            .then(() => {
                toast.success("Members added");
                setSelected([]);
                router.refresh();
                onClose();
            })
            .catch((error) => {
                const message = error?.response?.data;
                toast.error(typeof message === "string" ? message : "Something went wrong");
            })
            .finally(() => setIsLoading(false));
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="space-y-12">
                <div className="border-b border-gray-900/10 pb-12">
                    <h2 className="text-base font-semibold leading-7 text-gray-900">
                        Add members
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                        Invite people to this group chat.
                    </p>
                    <div className="mt-10 flex flex-col gap-y-8">
                        <Select
                            disabled={isLoading}
                            label="Members"
                            options={users.map((user) => ({
                                value: user.id,
                                label: user.name,
                            }))}
                            onChange={(value) => setSelected(value as Record<string, any>[])}
                            value={selected}
                        />
                    </div>
                </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-x-6">
                <Button
                    disabled={isLoading}
                    onClick={onClose}
                    type="button"
                    secondary
                >
                    Cancel
                </Button>
                <Button
                    disabled={isLoading || selected.length === 0}
                    onClick={onSubmit}
                    type="button"
                >
                    Add
                </Button>
            </div>
        </Modal>
    );
};

export default AddMemberModal;
