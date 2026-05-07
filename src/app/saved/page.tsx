import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SavedRecipes } from "@/components/saved-recipes";
import { authOptions } from "@/lib/auth";

export default async function SavedPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return <SavedRecipes />;
}
