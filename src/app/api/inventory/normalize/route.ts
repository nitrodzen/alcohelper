import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions, getSessionUserId } from "@/lib/auth";
import { normalizeInventoryWithAI } from "@/lib/ai";
import { inventoryInputSchema } from "@/lib/inventory";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const normalizeSchema = inventoryInputSchema.partial().extend({
  name: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);

  if (!userId) {
    return NextResponse.json({ error: "Нужна авторизация." }, { status: 401 });
  }

  if (!checkRateLimit(`normalize:${userId}`, 60)) {
    return NextResponse.json({ error: "Слишком много AI-запросов. Попробуйте позже." }, { status: 429 });
  }

  const parsed = normalizeSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Нужно хотя бы название предмета." }, { status: 400 });
  }

  const result = await normalizeInventoryWithAI(parsed.data);

  if (!result.aiReviewed) {
    return NextResponse.json({ error: "AI не смог надежно заполнить предмет. Попробуйте уточнить название." }, { status: 422 });
  }

  return NextResponse.json(result);
}
