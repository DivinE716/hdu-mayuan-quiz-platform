import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { success, error } from "@/lib/api-response";

const TYPE_FIELD: Record<string, string> = {
  single: "lastSingleId",
  multiple: "lastMultipleId",
  judge: "lastJudgmentId",
};

/**
 * GET  /api/progress/position?type=single|multiple|judge
 *      返回该题型上次做到的题目 ID（接续刷题）
 *
 * POST /api/progress/position
 *      Body: { type, questionId }
 *      保存当前题型的最新位置
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return error("请先登录", 401);

    const type = request.nextUrl.searchParams.get("type") || "";
    if (!type || !TYPE_FIELD[type]) return error("无效的题型参数", 400);

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { [TYPE_FIELD[type]]: true } as Record<string, boolean>,
    });

    const lastId = (user as Record<string, string | null> | null)?.[TYPE_FIELD[type]] ?? null;

    return success({ type, lastId });
  } catch (err) {
    console.error("[position GET] error:", err);
    return error("服务器内部错误", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return error("请先登录", 401);

    let body: { type?: string; questionId?: string };
    try {
      const text = await request.text();
      body = JSON.parse(text);
    } catch {
      return error("请求格式错误", 400);
    }

    if (!body.type || !TYPE_FIELD[body.type] || !body.questionId) {
      return error("缺少 type 或 questionId", 400);
    }

    await prisma.user.update({
      where: { id: authUser.userId },
      data: { [TYPE_FIELD[body.type]]: body.questionId },
    });

    return success({ ok: true });
  } catch (err) {
    console.error("[position POST] error:", err);
    return error("服务器内部错误", 500);
  }
}
