import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { success, error } from "@/lib/api-response";

/**
 * GET /api/admin/stats
 *
 * Headers: x-admin-token: <ADMIN_TOKEN>
 *
 * 返回管理后台所需的全部统计数据
 */
export async function GET(request: NextRequest) {
  try {
    // ---- Token 验证 ----
    const token = request.headers.get("x-admin-token");
    const expected = process.env.ADMIN_TOKEN || "mayuan-admin-2026-secure";
    if (!token || token !== expected) {
      return error("无权限访问", 403);
    }

    // ---- 并行查询所有数据 ----
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      totalProgress,
      topWrongQuestions,
      allUsers,
    ] = await Promise.all([
      // a. 总注册用户数
      prisma.user.count(),

      // b. 活跃用户数（过去10分钟内 updatedAt 有更新的 UserProgress 去重 userId）
      prisma.userProgress
        .findMany({
          where: { updatedAt: { gte: tenMinutesAgo } },
          select: { userId: true },
          distinct: ["userId"],
        })
        .then((rows) => rows.length),

      // c. 总刷题次数（UserProgress 记录数）
      prisma.userProgress.count(),

      // d. 高频错题 TOP 10
      prisma.userProgress.findMany({
        where: { wrongCount: { gt: 0 } },
        orderBy: { wrongCount: "desc" },
        take: 10,
        select: {
          wrongCount: true,
          question: {
            select: {
              id: true,
              type: true,
              questionText: true,
            },
          },
        },
      }),

      // e. 所有用户列表（含刷题统计）
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          createdAt: true,
          progress: {
            select: {
              isMastered: true,
              questionId: true,
            },
          },
        },
      }),
    ]);

    // ---- 组装用户列表 ----
    const userList = allUsers.map((u) => {
      const done = u.progress.length;
      const mastered = u.progress.filter((p) => p.isMastered).length;
      const accuracy = done > 0 ? Math.round((mastered / done) * 100) : 0;
      return {
        username: u.username,
        createdAt: u.createdAt,
        doneCount: done,
        accuracy,
      };
    });

    // ---- 组装错题榜 ----
    const wrongList = topWrongQuestions.map((w) => ({
      id: w.question.id,
      type: w.question.type,
      text: w.question.questionText.length > 40
        ? w.question.questionText.slice(0, 40) + "..."
        : w.question.questionText,
      wrongCount: w.wrongCount,
    }));

    return success({
      totalUsers,
      activeUsers,
      totalProgress,
      userList,
      wrongList,
    });
  } catch (err) {
    console.error("[admin/stats] error:", err);
    return error("服务器内部错误", 500);
  }
}
