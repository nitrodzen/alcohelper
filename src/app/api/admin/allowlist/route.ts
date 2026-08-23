import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalAdminUser, type PortalAdminUser } from "@/lib/admin";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const allowlistEntrySchema = z.object({
  email: z.string().trim().email().max(180),
});

type AdminAuthorization =
  | { admin: PortalAdminUser }
  | { status: 401 | 403; error: string };

type AllowlistEntryRecord = {
  id: string;
  email: string;
  createdByEmail: string;
  createdAt: Date;
};

async function authorizeAdmin(): Promise<AdminAuthorization> {
  const session = await getServerSession(authOptions);
  if (!getSessionUserId(session)) {
    return { status: 401, error: "Нужна авторизация." };
  }

  const admin = await getPortalAdminUser(session);
  return admin ? { admin } : { status: 403, error: "Недостаточно прав." };
}

function serializeEntry(entry: AllowlistEntryRecord, registered: boolean) {
  return {
    id: entry.id,
    email: entry.email,
    createdByEmail: entry.createdByEmail,
    createdAt: entry.createdAt.toISOString(),
    registered,
  };
}

export async function GET() {
  const authorization = await authorizeAdmin();
  if (!("admin" in authorization)) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const entries = await prisma.registrationAllowlistEntry.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      createdByEmail: true,
      createdAt: true,
    },
  });
  const registeredUsers = entries.length
    ? await prisma.user.findMany({
        where: { email: { in: entries.map((entry) => entry.email) } },
        select: { email: true },
      })
    : [];
  const registeredEmails = new Set(registeredUsers.map((user) => user.email.toLowerCase()));

  return NextResponse.json({
    entries: entries.map((entry) => serializeEntry(entry, registeredEmails.has(entry.email))),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeAdmin();
  if (!("admin" in authorization)) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  if (!checkRateLimit(`admin-allowlist:${authorization.admin.id}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много изменений. Попробуйте позже." }, { status: 429 });
  }

  const parsed = allowlistEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите корректный email." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.registrationAllowlistEntry.findUnique({ where: { email } });
  const entry = await prisma.registrationAllowlistEntry.upsert({
    where: { email },
    create: {
      email,
      createdByUserId: authorization.admin.id,
      createdByEmail: authorization.admin.email,
    },
    update: {},
  });
  const registered = Boolean(await prisma.user.findUnique({ where: { email }, select: { id: true } }));

  return NextResponse.json(
    { entry: serializeEntry(entry, registered), alreadyAllowed: Boolean(existing) },
    { status: existing ? 200 : 201 },
  );
}
