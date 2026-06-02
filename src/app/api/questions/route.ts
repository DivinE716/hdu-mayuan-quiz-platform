import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { success, error } from "@/lib/api-response";

type QuestionFilter = "wrong" | "favorite";

/**
 * 简单的确定性洗牌（Fisher-Yates + seed）
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    // 简单的伪随机数生成器
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * GET /api/questions
 *
 * Query params:
 *   type    — 筛选题型：single | multiple | judge（可多选）
 *   filter  — 用户进度筛选：wrong（错题本）| favorite（收藏夹），需登录
 *   order   — 排序：asc（默认）| random（随机，需 seed 参数保持一致性）
 *   seed    — 随机种子（与 order=random 配合使用，不传则自动生成）
 *   page    — 分页页码，默认 1
 *   pageSize— 每页条数，默认 20，最大 200
 *
 * 返回题目列表，同时关联当前用户的刷题进度
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // ---- 解析筛选参数 ----
    const types = searchParams.getAll("type").filter((t) =>
      ["single", "multiple", "judge"].includes(t),
    );

    const filter = searchParams.get("filter") as QuestionFilter | null;
    const order = searchParams.get("order") || "asc";
    const seed = parseInt(searchParams.get("seed") || "0", 10) || Date.now();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20),
    );

    // ---- 解析当前用户 ----
    const authUser = await getAuthUser();

    // 错题本 / 收藏夹需要登录
    if ((filter === "wrong" || filter === "favorite") && !authUser) {
      return error("请先登录", 401);
    }

    // ---- 处理进度筛选（错题本 / 收藏夹） ----
    if (filter === "wrong" || filter === "favorite") {
      return handleProgressFilter(authUser!.userId, filter, types, page, pageSize);
    }

    // ---- 构建查询条件 ----
    const where: Record<string, unknown> = types.length > 0 ? { type: { in: types } } : {};

    // ---- 随机排序：先取所有 ID → 洗牌 → 分页 ----
    if (order === "random") {
      return handleRandomOrder(where, authUser?.userId, seed, page, pageSize);
    }

    // ---- 默认顺序 ----
    const [total, questions] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const progressMap = await loadProgress(authUser?.userId, questions);

    const data = questions.map((q) => ({
      id: q.id,
      type: q.type,
      questionText: q.questionText,
      options: q.options,
      answer: q.answer,
      analysisText: q.analysisText,
      ...(progressMap.get(q.id) ?? { isFavorite: false, wrongCount: 0, isMastered: false }),
    }));

    return success({
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      questions: data,
    });
  } catch (err) {
    console.error("[questions] error:", err);
    return error("服务器内部错误", 500);
  }
}

// ---- 辅助函数 ----

/**
 * 加载一批题目的用户进度
 */
async function loadProgress(
  userId: string | undefined,
  questions: { id: string }[],
): Promise<Map<string, { isFavorite: boolean; wrongCount: number; isMastered: boolean }>> {
  const map = new Map<string, { isFavorite: boolean; wrongCount: number; isMastered: boolean }>();
  if (!userId || questions.length === 0) return map;

  const progressList = await prisma.userProgress.findMany({
    where: {
      userId,
      questionId: { in: questions.map((q) => q.id) },
    },
    select: {
      questionId: true,
      isFavorite: true,
      wrongCount: true,
      isMastered: true,
    },
  });

  for (const p of progressList) {
    map.set(p.questionId, {
      isFavorite: p.isFavorite,
      wrongCount: p.wrongCount,
      isMastered: p.isMastered,
    });
  }
  return map;
}

/**
 * 随机顺序：取所有 ID → 确定性洗牌 → 分页返回
 */
async function handleRandomOrder(
  where: Record<string, unknown>,
  userId: string | undefined,
  seed: number,
  page: number,
  pageSize: number,
) {
  const allIds = await prisma.question.findMany({
    where,
    select: { id: true },
  });

  const total = allIds.length;
  const shuffled = seededShuffle(allIds.map((q) => q.id), seed);
  const pageIds = shuffled.slice((page - 1) * pageSize, page * pageSize);

  const questions = await prisma.question.findMany({
    where: { id: { in: pageIds } },
  });

  // 恢复洗牌后的顺序
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const ordered = pageIds.map((id) => questionMap.get(id)).filter(Boolean);

  const progressMap = await loadProgress(userId, ordered as { id: string }[]);

  const data = ordered.map((q) => ({
    id: q!.id,
    type: q!.type,
    questionText: q!.questionText,
    options: q!.options,
    answer: q!.answer,
    analysisText: q!.analysisText,
    ...(progressMap.get(q!.id) ?? { isFavorite: false, wrongCount: 0, isMastered: false }),
  }));

  return success({
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    questions: data,
  });
}

/**
 * 处理错题本 / 收藏夹筛选（基于 UserProgress 表反向查 Question）
 */
async function handleProgressFilter(
  userId: string,
  filter: "wrong" | "favorite",
  types: string[],
  page: number,
  pageSize: number,
) {
  // 先找出符合条件的 UserProgress 记录
  const progressWhere: Record<string, unknown> = { userId };

  if (filter === "wrong") {
    progressWhere.wrongCount = { gt: 0 };
  } else {
    progressWhere.isFavorite = true;
  }

  // 如果同时按题型筛选，需要先找出对应题型的 questionId
  if (types.length > 0) {
    const typedQuestions = await prisma.question.findMany({
      where: { type: { in: types } },
      select: { id: true },
    });
    progressWhere.questionId = { in: typedQuestions.map((q) => q.id) };
  }

  const allProgress = await prisma.userProgress.findMany({
    where: progressWhere,
    orderBy: { updatedAt: "desc" },
    select: { questionId: true, isFavorite: true, wrongCount: true, isMastered: true },
  });

  const total = allProgress.length;

  // 分页
  const pagedProgress = allProgress.slice((page - 1) * pageSize, page * pageSize);
  const pagedQuestionIds = pagedProgress.map((p) => p.questionId);

  // 查出对应题目
  const questions = await prisma.question.findMany({
    where: { id: { in: pagedQuestionIds } },
  });

  // 保持与 progress 相同的顺序
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  const data = pagedProgress
    .map((p) => {
      const q = questionMap.get(p.questionId);
      if (!q) return null;
      return {
        id: q.id,
        type: q.type,
        questionText: q.questionText,
        options: q.options,
        answer: q.answer,
        analysisText: q.analysisText,
        isFavorite: p.isFavorite,
        wrongCount: p.wrongCount,
        isMastered: p.isMastered,
      };
    })
    .filter(Boolean);

  return success({
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    questions: data,
  });
}
