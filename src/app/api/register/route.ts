import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isRegistrationAllowedForSignup } from "@/lib/registration-access";
import { seedInitialInventoryForUser } from "@/lib/seed";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(120),
  ageConfirmed: z.literal(true),
});

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (!checkRateLimit(`register:${clientIp}`, 8, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много попыток регистрации. Попробуйте позже." }, { status: 429 });
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте email, пароль и подтверждение возраста." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  if (!(await isRegistrationAllowedForSignup(email))) {
    return NextResponse.json({ error: "Этот email не включен в список приглашенных." }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hash(parsed.data.password, 12),
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  await seedInitialInventoryForUser(user.id);

  return NextResponse.json({ user }, { status: 201 });
}
