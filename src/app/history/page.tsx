import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { RequestHistory } from "@/components/request-history";
import { authOptions } from "@/lib/auth";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return <RequestHistory />;
}
