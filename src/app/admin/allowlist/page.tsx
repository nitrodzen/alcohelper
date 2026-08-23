import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AllowlistManager } from "@/components/allowlist-manager";
import { getPortalAdminUser } from "@/lib/admin";
import { authOptions } from "@/lib/auth";

export default async function AllowlistAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (!(await getPortalAdminUser(session))) {
    redirect("/");
  }

  return <AllowlistManager />;
}
