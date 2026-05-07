import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { InventoryManager } from "@/components/inventory-manager";
import { authOptions } from "@/lib/auth";

export default async function InventoryPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return <InventoryManager />;
}
