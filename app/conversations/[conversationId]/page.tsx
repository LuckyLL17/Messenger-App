import getConversationById from "@/app/actions/getConversationById";
import getMessages from "@/app/actions/getMessages";
import EmptyState from "@/app/components/EmptyState";
import Header from "./components/Header";
import Body from "./components/Body";
import Form from "./components/Form";

interface IParams {
    conversationId: string;
}

interface SearchParams {
    message?: string;
}

const ConversationId = async ({
    params,
    searchParams,
}: {
    params: Promise<IParams>;
    searchParams: Promise<SearchParams>;
}) => {
    const { conversationId } = await params;
    const { message } = await searchParams;
    const conversation = await getConversationById(conversationId);
    const messages = await getMessages(conversationId);

    if (!conversation) {
        return (
            <div className="lg:pl-80 h-full">
                <div className="h-full flex flex-col">
                    <EmptyState />
                </div>
            </div>
        );
    }

    return (
        <div className="lg:pl-80 h-full">
            <div className="h-full flex flex-col">
                <Header conversation={conversation} />
                <Body
                    initialMessages={messages}
                    highlightMessageId={message}
                />
                <Form />
            </div>
        </div>
    );
};

export default ConversationId;
