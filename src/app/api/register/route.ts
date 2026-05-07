import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(120),
  ageConfirmed: z.literal(true),
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте email, пароль и подтверждение возраста." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
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

  return NextResponse.json({ user }, { status: 201 });
}
