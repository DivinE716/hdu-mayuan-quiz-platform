"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "@/components/Navbar";
import AppLink from "@/components/AppLink";
import {
  apiGetQuestions,
  apiSyncProgress,
  apiGetLastPosition,
  apiSaveLastPosition,
  QuestionItem,
} from "@/lib/api";

// ============================================================
// 类型
// ============================================================

type AnswerState = "idle" | "correct" | "wrong";

interface QuestionState {
  answerState: AnswerState;
  selectedOptions: string[];
  isFavorite: boolean;
}

// ============================================================
// Props
// ============================================================

interface PracticeClientProps {
  typeParam?: string;
  filterParam?: "wrong" | "favorite";
}

// ============================================================
// 题型 → type 参数映射
// ============================================================

function getPracticeType(typeParam?: string): string | null {
  if (typeParam === "single" || typeParam === "multiple" || typeParam === "judge") {
    return typeParam;
  }
  return null;
}

// ============================================================
// 组件
// ============================================================

export default function PracticeClient({ typeParam, filterParam }: PracticeClientProps) {
  // ---- 随机种子 ----
  const randomSeed = useRef(Date.now());

  // ---- 接续刷题 ----
  const practiceType = getPracticeType(typeParam);
  const [resumeTargetId, setResumeTargetId] = useState<string | null>(null);
  const [showResumeTip, setShowResumeTip] = useState(false);

  // ---- 题目数据 ----
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---- 答题状态 ----
  const [questionStates, setQuestionStates] = useState<Map<string, QuestionState>>(new Map());

  // ---- 解析面板 ----
  const [showAnalysis, setShowAnalysis] = useState(false);

  // ---- 是否「全部题目」模式 ----
  const isAllMode = !typeParam && !filterParam;

  // ---- 组件挂载时：获取上次做到哪一题 ----
  useEffect(() => {
    if (!practiceType) return; // 错题本/收藏夹/全部题目不接续
    apiGetLastPosition(practiceType).then((lastId) => {
      if (lastId) setResumeTargetId(lastId);
    });
  }, [practiceType]);

  // ---- 获取题目 ----
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params: {
        type?: string[];
        filter?: "wrong" | "favorite";
        order?: "asc" | "random";
        seed?: number;
        pageSize: number;
      } = { pageSize: 200 };

      if (filterParam) params.filter = filterParam;
      if (typeParam) params.type = typeParam.split(",");
      if (isAllMode) { params.order = "random"; params.seed = randomSeed.current; }

      const res = await apiGetQuestions(params);

      if (res.success && res.data) {
        if (res.data.questions.length === 0) {
          setError(filterParam === "wrong" ? "错题本为空，继续加油！" : "暂无题目");
        } else {
          setQuestions(res.data.questions);
          setTotalQuestions(res.data.total);
          setCurrentPage(1);
          setHasMore(res.data.page < res.data.totalPages);

          // 初始化题目状态
          const states = new Map<string, QuestionState>();
          for (const q of res.data.questions) {
            states.set(q.id, {
              answerState: "idle",
              selectedOptions: [],
              isFavorite: q.isFavorite,
            });
          }
          setQuestionStates(states);

          // 接续：找上次做到的题目
          let startIdx = 0;
          if (resumeTargetId) {
            const foundIdx = res.data.questions.findIndex((q) => q.id === resumeTargetId);
            if (foundIdx >= 0) {
              startIdx = foundIdx;
              setShowResumeTip(true);
            }
          }
          setCurrentIndex(startIdx);
          setShowAnalysis(false);

          // 接续提示 3 秒后自动消失
          if (startIdx > 0) {
            setTimeout(() => setShowResumeTip(false), 3000);
          }
        }
      } else {
        setError(res.error || "加载题目失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [typeParam, filterParam, isAllMode, resumeTargetId]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // ---- 加载更多 ----
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    try {
      const params: {
        type?: string[]; filter?: "wrong" | "favorite";
        order?: "asc" | "random"; seed?: number; page: number; pageSize: number;
      } = { page: currentPage + 1, pageSize: 200 };
      if (filterParam) params.filter = filterParam;
      if (typeParam) params.type = typeParam.split(",");
      if (isAllMode) { params.order = "random"; params.seed = randomSeed.current; }

      const res = await apiGetQuestions(params);
      if (res.success && res.data && res.data.questions.length > 0) {
        setQuestions((prev) => [...prev, ...res.data!.questions]);
        setCurrentPage(res.data.page);
        setHasMore(res.data.page < res.data.totalPages);
        setQuestionStates((prev) => {
          const next = new Map(prev);
          for (const q of res.data!.questions) {
            if (!next.has(q.id)) {
              next.set(q.id, { answerState: "idle", selectedOptions: [], isFavorite: q.isFavorite });
            }
          }
          return next;
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [hasMore, loading, currentPage, typeParam, filterParam, isAllMode]);

  useEffect(() => {
    if (currentIndex >= questions.length - 10 && hasMore && !loading) loadMore();
  }, [currentIndex, questions.length, hasMore, loading, loadMore]);

  // ---- 当前题目 ----
  const currentQuestion = questions[currentIndex] ?? null;
  const currentState = currentQuestion ? questionStates.get(currentQuestion.id) : undefined;

  // ---- 解析选项 ----
  const options: { key: string; text: string }[] = (() => {
    if (!currentQuestion) return [];
    try {
      const obj = JSON.parse(currentQuestion.options);
      return Object.entries(obj).map(([key, text]) => ({ key, text: text as string }));
    } catch { return []; }
  })();

  // ---- 解析正确答案 ----
  const correctAnswers: string[] = (() => {
    if (!currentQuestion) return [];
    try { return JSON.parse(currentQuestion.answer) as string[]; } catch { return []; }
  })();

  const isAnswered = currentState?.answerState !== "idle";

  // ---- 同步进度 ----
  const syncProgress = useCallback(
    async (questionId: string, actions: { questionId: string; action: string }[]) => {
      try { await apiSyncProgress(actions); } catch { /* 静默 */ }
    }, [],
  );

  // ---- 保存当前题目位置（按题型） ----
  const saveCurrentPosition = useCallback(
    (qId: string) => {
      if (!practiceType) return;
      apiSaveLastPosition(practiceType, qId).catch(() => {});
    }, [practiceType],
  );

  // ---- 单选/判断 ----
  const handleSingleChoice = (optionKey: string) => {
    if (!currentQuestion || !currentState || isAnswered) return;
    const isCorrect = correctAnswers.includes(optionKey);
    setQuestionStates((prev) => {
      const next = new Map(prev);
      next.set(currentQuestion.id, {
        ...currentState, answerState: isCorrect ? "correct" : "wrong", selectedOptions: [optionKey],
      });
      return next;
    });
    setShowAnalysis(true);
    syncProgress(currentQuestion.id, [
      { questionId: currentQuestion.id, action: isCorrect ? "correct" : "wrong" },
    ]);
  };

  // ---- 多选勾选 ----
  const handleMultipleToggle = (optionKey: string) => {
    if (!currentQuestion || !currentState || isAnswered) return;
    setQuestionStates((prev) => {
      const next = new Map(prev);
      const cs = next.get(currentQuestion.id)!;
      const selected = cs.selectedOptions.includes(optionKey)
        ? cs.selectedOptions.filter((k) => k !== optionKey)
        : [...cs.selectedOptions, optionKey];
      next.set(currentQuestion.id, { ...cs, selectedOptions: selected });
      return next;
    });
  };

  // ---- 多选提交 ----
  const handleMultipleSubmit = () => {
    if (!currentQuestion || !currentState || isAnswered) return;
    const selected = currentState.selectedOptions;
    const sortedSelected = [...selected].sort();
    const sortedCorrect = [...correctAnswers].sort();
    const isCorrect = sortedSelected.length === sortedCorrect.length
      && sortedSelected.every((k, i) => k === sortedCorrect[i]);
    setQuestionStates((prev) => {
      const next = new Map(prev);
      next.set(currentQuestion.id, { ...currentState, answerState: isCorrect ? "correct" : "wrong" });
      return next;
    });
    setShowAnalysis(true);
    syncProgress(currentQuestion.id, [
      { questionId: currentQuestion.id, action: isCorrect ? "correct" : "wrong" },
    ]);
  };

  // ---- 收藏 ----
  const handleToggleFavorite = () => {
    if (!currentQuestion || !currentState) return;
    const newFav = !currentState.isFavorite;
    setQuestionStates((prev) => {
      const next = new Map(prev);
      next.set(currentQuestion.id, { ...currentState, isFavorite: newFav });
      return next;
    });
    syncProgress(currentQuestion.id, [
      { questionId: currentQuestion.id, action: newFav ? "favorite" : "unfavorite" },
    ]);
  };

  // ---- 导航 ----
  const goTo = (index: number) => {
    if (index < 0 || index >= questions.length) return;
    setCurrentIndex(index);
    setShowAnalysis(false);
    // 异步保存位置到服务器
    if (questions[index]) saveCurrentPosition(questions[index].id);
  };

  // ---- 选项样式 ----
  function getOptionStyle(key: string): string {
    if (!isAnswered) {
      const isSelected = currentState?.selectedOptions.includes(key);
      if (currentQuestion?.type === "multiple" && isSelected) {
        return "border-morandi-primary bg-morandi-primary/10 ring-2 ring-morandi-primary/30";
      }
      return "border-morandi-muted bg-morandi-surface hover:border-morandi-primary/60 hover:bg-morandi-primary/5";
    }
    const isCorrectOption = correctAnswers.includes(key);
    const isUserSelected = currentState?.selectedOptions.includes(key);
    if (isCorrectOption) return "border-morandi-success bg-morandi-success/15 ring-2 ring-morandi-success/40";
    if (isUserSelected && !isCorrectOption) return "border-morandi-danger bg-morandi-danger/10 ring-2 ring-morandi-danger/40";
    return "border-morandi-muted bg-morandi-surface opacity-60";
  }

  // ============================================================
  // 渲染
  // ============================================================

  const modeLabel = filterParam === "wrong" ? "错题本"
    : filterParam === "favorite" ? "收藏夹"
    : typeParam ? { single: "单选题", multiple: "多选题", judge: "判断题" }[typeParam] ?? "刷题"
    : "全部题目";

  return (
    <div className="min-h-screen bg-morandi-bg">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* 顶部信息栏 */}
        <div className="flex items-center justify-between mb-5">
          <AppLink href="/" replace className="text-sm text-morandi-text-soft hover:text-morandi-primary transition-colors flex items-center gap-1 cursor-pointer">
            ← 返回
          </AppLink>
          <span className="text-sm text-morandi-text-soft font-medium">
            {modeLabel}
            {totalQuestions > 0 && (
              <span className="ml-1 text-morandi-primary">({currentIndex + 1}/{totalQuestions})</span>
            )}
          </span>
        </div>

        {/* 接续提示 */}
        {showResumeTip && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-morandi-primary/10 border border-morandi-primary/20 text-sm text-morandi-primary text-center animate-pulse">
            📍 已为你自动接续上次进度
          </div>
        )}

        {/* 加载中 */}
        {loading && questions.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="w-8 h-8 border-2 border-morandi-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-morandi-text-soft text-sm">加载题目中...</p>
          </div>
        )}

        {/* 错误/空 */}
        {!loading && error && questions.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-morandi-text-soft text-lg">{error}</p>
            <AppLink href="/" replace className="text-morandi-primary hover:underline text-sm cursor-pointer">返回首页</AppLink>
          </div>
        )}

        {/* 题目卡片 */}
        {currentQuestion && (
          <div className="space-y-4">
            {/* 收藏 + 题型 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-morandi-text-soft">
                题型：{currentQuestion.type === "single" ? "单选题" : currentQuestion.type === "multiple" ? "多选题" : "判断题"}
              </span>
              <button onClick={handleToggleFavorite}
                className={`text-2xl transition-all active:scale-125 ${currentState?.isFavorite ? "text-yellow-500 drop-shadow-sm" : "text-morandi-muted hover:text-yellow-400"}`}
                title={currentState?.isFavorite ? "取消收藏" : "收藏"}>★</button>
            </div>

            {/* 题目文本 */}
            <div className="bg-morandi-surface rounded-2xl p-6 shadow-sm border border-morandi-muted/60">
              <p className="text-base leading-relaxed text-morandi-text-main">{currentQuestion.questionText}</p>
            </div>

            {/* 选项 */}
            <div className="space-y-2.5">
              {options.map((opt) => (
                <button key={opt.key}
                  onClick={() => currentQuestion.type === "multiple" ? handleMultipleToggle(opt.key) : handleSingleChoice(opt.key)}
                  disabled={isAnswered && currentQuestion.type !== "multiple"}
                  className={`w-full text-left px-5 py-3.5 rounded-xl border-2 text-base leading-relaxed transition-all duration-200 ${getOptionStyle(opt.key)} disabled:cursor-default`}>
                  <span className="inline-flex items-center gap-3">
                    {currentQuestion.type === "multiple" ? (
                      <span className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs transition-all ${currentState?.selectedOptions.includes(opt.key) ? "bg-morandi-primary border-morandi-primary text-white" : "border-morandi-muted"} ${isAnswered && correctAnswers.includes(opt.key) ? "!bg-morandi-success !border-morandi-success text-white" : ""}`}>
                        {currentState?.selectedOptions.includes(opt.key) || (isAnswered && correctAnswers.includes(opt.key)) ? "✓" : ""}
                      </span>
                    ) : (
                      <span className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all ${isAnswered && correctAnswers.includes(opt.key) ? "bg-morandi-success border-morandi-success text-white" : isAnswered && currentState?.selectedOptions.includes(opt.key) && !correctAnswers.includes(opt.key) ? "bg-morandi-danger border-morandi-danger text-white" : "border-morandi-muted text-transparent"}`}>
                        {isAnswered && correctAnswers.includes(opt.key) ? "✓" : isAnswered && currentState?.selectedOptions.includes(opt.key) ? "✗" : ""}
                      </span>
                    )}
                    <span><span className="font-medium text-morandi-primary mr-2">{opt.key}</span>{opt.text}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* 多选提交 */}
            {currentQuestion.type === "multiple" && !isAnswered && (
              <button onClick={handleMultipleSubmit} disabled={currentState?.selectedOptions.length === 0}
                className="w-full py-3 rounded-xl bg-morandi-primary text-white font-medium text-base hover:opacity-90 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all">提交答案</button>
            )}

            {/* 反馈 */}
            {isAnswered && (
              <div className={`rounded-xl p-4 text-sm leading-relaxed ${currentState?.answerState === "correct" ? "bg-morandi-success/10 border border-morandi-success/30 text-morandi-success" : "bg-morandi-danger/10 border border-morandi-danger/30 text-morandi-danger"}`}>
                <p className="font-semibold mb-1">{currentState?.answerState === "correct" ? "✅ 回答正确！" : "❌ 回答错误"}</p>
                {currentState?.answerState === "wrong" && (
                  <p>正确答案：{correctAnswers.join("、")}{currentQuestion.type === "judge" && `（${correctAnswers[0] === "A" ? "正确" : "错误"}）`}</p>
                )}
              </div>
            )}

            {/* 解析 */}
            {isAnswered && showAnalysis && (
              <div className="bg-morandi-surface rounded-2xl p-5 shadow-sm border border-morandi-muted/60">
                <h4 className="text-sm font-semibold text-morandi-text-main mb-2">📖 题目解析</h4>
                <p className="text-sm leading-relaxed text-morandi-text-soft">{currentQuestion.analysisText || "暂无解析内容"}</p>
              </div>
            )}

            {/* 底部导航 */}
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}
                className="flex-1 py-2.5 rounded-xl border-2 border-morandi-muted text-sm font-medium text-morandi-text-main hover:bg-morandi-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all">上一题</button>
              {isAnswered && !showAnalysis && (
                <button onClick={() => setShowAnalysis(true)}
                  className="flex-1 py-2.5 rounded-xl bg-morandi-secondary/50 text-sm font-medium text-morandi-text-main hover:bg-morandi-secondary/70 transition-all">查看解析</button>
              )}
              <button onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= questions.length - 1}
                className="flex-1 py-2.5 rounded-xl bg-morandi-primary text-white text-sm font-medium hover:opacity-90 hover:shadow-md disabled:opacity-30 disabled:cursor-not-allowed transition-all">下一题</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
