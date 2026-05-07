import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RecipeLab } from "@/components/recipe-lab";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return <RecipeLab />;
}
