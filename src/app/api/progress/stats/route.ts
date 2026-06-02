import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { success, error } from "@/lib/api-response";

/**
 * GET /api/progress/stats
 *
 * 返回当前用户的整体学习进度统计（需登录）
 */
export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return error("请先登录", 401);
    }

    const userId = authUser.userId;

    // 并行查询所有统计数据
    const [
      totalQuestions,
      totalProgress,
      masteredCount,
      wrongCount,
      favoriteCount,
    ] = await Promise.all([
      prisma.question.count(),
      prisma.userProgress.count({ where: { userId } }),
      prisma.userProgress.count({
        where: { userId, isMastered: true },
      }),
      prisma.userProgress.count({
        where: { userId, wrongCount: { gt: 0 } },
      }),
      prisma.userProgress.count({
        where: { userId, isFavorite: true },
      }),
    ]);

    // 正确率 = 已掌握 / 已做题（有进度的题）
    const accuracy =
      totalProgress > 0
        ? Math.round((masteredCount / totalProgress) * 100)
        : 0;

    return success({
      totalQuestions,
      attemptedCount: totalProgress,
      masteredCount,
      wrongCount,
      favoriteCount,
      accuracy,
    });
  } catch (err) {
    console.error("[progress/stats] error:", err);
    return error("服务器内部错误", 500);
  }
}
