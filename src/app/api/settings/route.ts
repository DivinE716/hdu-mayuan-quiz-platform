import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { success, error } from "@/lib/api-response";

/**
 * GET  /api/settings?key=xxx  — 读取指定 key 的设置值
 * POST /api/settings           — 保存设置  Body: { key, value }
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return error("请先登录", 401);

    const key = request.nextUrl.searchParams.get("key");
    if (!key) return error("缺少 key 参数");

    const setting = await prisma.userSettings.findUnique({
      where: {
        userId_key: { userId: authUser.userId, key },
      },
      select: { value: true },
    });

    return success({ value: setting?.value ?? null });
  } catch (err) {
    console.error("[settings GET] error:", err);
    return error("服务器内部错误", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return error("请先登录", 401);

    let body: { key?: string; value?: string };
    try {
      const text = await request.text();
      body = JSON.parse(text);
    } catch {
      return error("请求格式错误", 400);
    }

    if (!body.key) return error("缺少 key");

    await prisma.userSettings.upsert({
      where: {
        userId_key: { userId: authUser.userId, key: body.key },
      },
      create: {
        userId: authUser.userId,
        key: body.key,
        value: body.value ?? "",
      },
      update: { value: body.value ?? "" },
    });

    return success({ ok: true });
  } catch (err) {
    console.error("[settings POST] error:", err);
    return error("服务器内部错误", 500);
  }
}
