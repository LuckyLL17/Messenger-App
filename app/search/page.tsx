import { redirect } from "next/navigation";
import getCurrentUser from "../actions/getCurrentUser";

export default async function SearchPage() {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        redirect("/");
    }

    return null;
}
