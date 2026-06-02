"use client";

import { useState, useEffect } from "react";
import ModuleCard from "@/components/ModuleCard";
import Navbar from "@/components/Navbar";
import { apiGetStats, StatsData } from "@/lib/api";

const defaultStats: StatsData = {
  totalQuestions: 1146,
  attemptedCount: 0,
  masteredCount: 0,
  wrongCount: 0,
  favoriteCount: 0,
  accuracy: 0,
};

export default function HomePage() {
  const [stats, setStats] = useState<StatsData>(defaultStats);

  useEffect(() => {
    // 只有已登录用户才请求统计数据（localStorage 中有 user 说明之前登录过）
    let hasUser = false;
    try {
      hasUser = !!localStorage.getItem("mayuan_user");
    } catch { /* ignore */ }

    if (!hasUser) return; // 未登录，直接使用 defaultStats，不发 API 请求

    let cancelled = false;
    apiGetStats()
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setStats(res.data);
        }
      })
      .catch(() => { /* 静默 */ });
    return () => { cancelled = true; };
  }, []);

  const progressPercent =
    stats.totalQuestions > 0
      ? Math.round((stats.attemptedCount / stats.totalQuestions) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-morandi-bg">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* ====== 学习进度面板 ====== */}
        <section className="bg-morandi-surface rounded-2xl p-5 shadow-sm border border-morandi-muted/60">
          <h2 className="text-base font-semibold text-morandi-text-main mb-4">
            学习进度
          </h2>

          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-morandi-text-soft">总进度</span>
              <span className="text-morandi-primary font-medium">
                {stats.attemptedCount} / {stats.totalQuestions}
              </span>
            </div>
            <div className="h-2 bg-morandi-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-morandi-primary rounded-full transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatItem label="正确率" value={`${stats.accuracy}%`} colorClass="text-morandi-success" />
            <StatItem label="已掌握" value={stats.masteredCount} colorClass="text-morandi-primary" />
            <StatItem label="错题本" value={stats.wrongCount} colorClass="text-morandi-danger" />
            <StatItem label="收藏夹" value={stats.favoriteCount} colorClass="text-morandi-accent" />
          </div>
        </section>

        {/* ====== 刷题模块入口 ====== */}
        <section>
          <h2 className="text-base font-semibold text-morandi-text-main mb-3">
            选择刷题模式
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <ModuleCard title="单选题" subtitle="夯实基础知识" count={441} href="/practice?type=single" icon="📝" colorClass="bg-morandi-primary/15 text-morandi-primary" />
            <ModuleCard title="多选题" subtitle="辨析易混概念" count={282} href="/practice?type=multiple" icon="📋" colorClass="bg-morandi-secondary/30 text-morandi-text-main" />
            <ModuleCard title="判断题" subtitle="快速查漏补缺" count={423} href="/practice?type=judge" icon="✅" colorClass="bg-morandi-success/15 text-morandi-success" />
            <ModuleCard title="错题本" subtitle="消灭所有错题" count={stats.wrongCount} href="/practice?filter=wrong" icon="🎯" colorClass="bg-morandi-danger/10 text-morandi-danger" />
            <ModuleCard title="收藏夹" subtitle="重温重点题" count={stats.favoriteCount} href="/practice?filter=favorite" icon="⭐" colorClass="bg-morandi-accent/15 text-morandi-accent" />
            <ModuleCard title="全部题目" subtitle="随机顺序挑战" count={1146} href="/practice" icon="🔄" colorClass="bg-morandi-muted/30 text-morandi-text-main" />
          </div>
        </section>
      </main>
    </div>
  );
}

function StatItem({ label, value, colorClass }: { label: string; value: string | number; colorClass: string }) {
  return (
    <div className="text-center p-3 rounded-xl bg-morandi-bg/70">
      <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-morandi-text-soft mt-0.5">{label}</div>
    </div>
  );
}
