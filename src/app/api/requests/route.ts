import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const requests = await prisma.recipeRequestHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    requests: requests.map((request) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
    })),
  });
}
