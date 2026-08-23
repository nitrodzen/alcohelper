import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { getPortalAdminUser } from "@/lib/admin";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!getSessionUserId(session)) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  const admin = await getPortalAdminUser(session);
  if (!admin) {
    return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
  }

  if (!checkRateLimit(`admin-allowlist:${admin.id}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много изменений. Попробуйте позже." }, { status: 429 });
  }

  const { id } = await context.params;
  const entry = await prisma.registrationAllowlistEntry.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!entry) {
    return NextResponse.json({ error: "Приглашение не найдено." }, { status: 404 });
  }

  await prisma.registrationAllowlistEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
