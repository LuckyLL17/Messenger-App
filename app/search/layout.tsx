import Sidebar from "../components/sidebar/Sidebar";
import getCurrentUser from "../actions/getCurrentUser";
import getSearchParticipants from "../actions/getSearchParticipants";
import SearchView from "./components/SearchView";

export default async function SearchLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const currentUser = await getCurrentUser();
    const participants = await getSearchParticipants();

    return (
        <Sidebar>
            <div className="h-full">
                <SearchView
                    currentUser={currentUser}
                    participants={participants}
                />
                {children}
            </div>
        </Sidebar>
    );
}
