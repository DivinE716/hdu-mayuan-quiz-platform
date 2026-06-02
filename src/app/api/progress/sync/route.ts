import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { success, error } from "@/lib/api-response";

// ---- 类型 ----

type ProgressAction =
  | "favorite"
  | "unfavorite"
  | "correct"
  | "wrong"
  | "master"
  | "unmaster";

interface SyncItem {
  questionId: string;
  action: ProgressAction;
}

interface ActionDiff {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

// ---- 辅助：根据 action 生成 create 与 update 字段 ----

function buildActionDiff(action: ProgressAction): ActionDiff {
  switch (action) {
    case "favorite":
      return {
        create: { isFavorite: true },
        update: { isFavorite: true },
      };
    case "unfavorite":
      return {
        create: { isFavorite: false },
        update: { isFavorite: false },
      };
    case "correct":
      return {
        create: { isMastered: true },
        update: { isMastered: true },
      };
    case "wrong":
      return {
        create: {
          wrongCount: 1,
          isMastered: false,
        },
        update: {
          wrongCount: { increment: 1 },
          isMastered: false,
        },
      };
    case "master":
      return {
        create: { isMastered: true },
        update: { isMastered: true },
      };
    case "unmaster":
      return {
        create: { isMastered: false },
        update: { isMastered: false },
      };
    default:
      return { create: {}, update: {} };
  }
}

// ---- 操作白名单 ----

const VALID_ACTIONS: ProgressAction[] = [
  "favorite",
  "unfavorite",
  "correct",
  "wrong",
  "master",
  "unmaster",
];

/**
 * POST /api/progress/sync
 *
 * Body: { items: { questionId: string; action: ProgressAction }[] }
 *
 * 批量同步用户的刷题行为数据（收藏、做对、做错、标记掌握等）
 * 使用 upsert 确保多端数据一致的创建/更新语义
 */
export async function POST(request: NextRequest) {
  try {
    // ---- 鉴权 ----
    const authUser = await getAuthUser();
    if (!authUser) {
      return error("请先登录", 401);
    }

    // ---- 解析 body ----
    let body: { items?: unknown[] };
    try {
      const text = await request.text();
      body = JSON.parse(text);
    } catch {
      return error("请求格式错误，请发送有效的 JSON", 400);
    }

    if (!body.items || !Array.isArray(body.items)) {
      return error("请求体格式错误：需要 items 数组");
    }

    const items: SyncItem[] = body.items as SyncItem[];

    if (items.length === 0) {
      return error("items 数组不能为空");
    }

    if (items.length > 200) {
      return error("单次最多同步 200 条记录");
    }

    // ---- 批量 upsert ----
    const results = await Promise.allSettled(
      items.map(async (item) => {
        // 参数校验
        if (!item.questionId || !item.action) {
          throw new Error("缺少 questionId 或 action");
        }

        if (!VALID_ACTIONS.includes(item.action)) {
          throw new Error(`无效的 action: ${item.action}`);
        }

        const diff = buildActionDiff(item.action);

        return prisma.userProgress.upsert({
          where: {
            userId_questionId: {
              userId: authUser.userId,
              questionId: item.questionId,
            },
          },
          create: {
            userId: authUser.userId,
            questionId: item.questionId,
            ...diff.create,
          },
          update: diff.update,
        });
      }),
    );

    // ---- 统计结果 ----
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const r of results) {
      if (r.status === "fulfilled") {
        synced++;
      } else {
        failed++;
        errors.push(r.reason?.message ?? "未知错误");
      }
    }

    return success({
      synced,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[progress/sync] error:", err);
    return error("服务器内部错误", 500);
  }
}
