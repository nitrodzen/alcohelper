import type { Session } from "next-auth";
import { isPortalAdminEmail } from "@/lib/admin-config";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PortalAdminUser = {
  id: string;
  email: string;
};

export async function getPortalAdminUser(session: Session | null): Promise<PortalAdminUser | null> {
  const userId = getSessionUserId(session);
  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  return user && isPortalAdminEmail(user.email) ? user : null;
}
