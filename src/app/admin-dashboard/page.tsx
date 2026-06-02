"use client";

import { useState, useEffect } from "react";

// ============================================================
// 类型
// ============================================================

interface AdminData {
  totalUsers: number;
  activeUsers: number;
  totalProgress: number;
  userList: {
    username: string;
    createdAt: string;
    doneCount: number;
    accuracy: number;
  }[];
  wrongList: {
    id: string;
    type: string;
    text: string;
    wrongCount: number;
  }[];
}

// ============================================================
// 组件
// ============================================================

export default function AdminDashboardPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 尝试从 sessionStorage 恢复 token
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_token");
    if (saved) {
      setToken(saved);
      fetchData(saved);
    }
  }, []);

  const fetchData = async (tk: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-token": tk },
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setAuthed(true);
        sessionStorage.setItem("admin_token", tk);
      } else {
        setError(json.error || "验证失败");
        sessionStorage.removeItem("admin_token");
        setAuthed(false);
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(token);
  };

  // ============================================================
  // 未认证 → 显示 Token 输入框
  // ============================================================
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-morandi-bg px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-morandi-surface rounded-2xl p-6 shadow-sm border border-morandi-muted/60 space-y-4"
        >
          <div className="text-center">
            <h1 className="text-xl font-bold text-morandi-text-main">管理员后台</h1>
            <p className="text-sm text-morandi-text-soft mt-1">请输入管理员 Token</p>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            autoFocus
            className="w-full px-4 py-2.5 text-base rounded-xl border border-morandi-muted
                       bg-morandi-bg text-morandi-text-main
                       focus:outline-none focus:ring-2 focus:ring-morandi-primary/40
                       transition-all"
          />
          {error && (
            <p className="text-sm text-morandi-danger bg-morandi-danger/10 px-3 py-2 rounded-lg text-center">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !token}
            className="w-full py-2.5 rounded-xl bg-morandi-primary text-white font-medium
                       text-base hover:opacity-90 disabled:opacity-40 transition-all"
          >
            {loading ? "验证中..." : "进入后台"}
          </button>
        </form>
      </div>
    );
  }

  // ============================================================
  // 已认证 → 数据面板
  // ============================================================
  const typeLabel: Record<string, string> = {
    single: "单选",
    multiple: "多选",
    judge: "判断",
  };

  return (
    <div className="min-h-screen bg-morandi-bg">
      {/* 顶栏 */}
      <nav className="sticky top-0 z-50 bg-morandi-surface/90 backdrop-blur border-b border-morandi-muted">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-semibold text-morandi-text-main">
            管理员监控后台
          </span>
          <button
            onClick={() => {
              sessionStorage.removeItem("admin_token");
              setAuthed(false);
              setData(null);
            }}
            className="text-sm text-morandi-text-soft hover:text-morandi-danger transition-colors"
          >
            退出
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ====== 顶部统计卡片 ====== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="总注册人数"
            value={data?.totalUsers ?? 0}
            icon="👥"
            color="bg-morandi-primary/10 border-morandi-primary/30"
            textColor="text-morandi-primary"
          />
          <StatCard
            label="当前活跃人数"
            value={data?.activeUsers ?? 0}
            subtitle="过去10分钟"
            icon="🟢"
            color="bg-morandi-success/10 border-morandi-success/30"
            textColor="text-morandi-success"
          />
          <StatCard
            label="总刷题次数"
            value={data?.totalProgress ?? 0}
            icon="📝"
            color="bg-morandi-accent/10 border-morandi-accent/30"
            textColor="text-morandi-accent"
          />
        </div>

        {/* ====== 用户列表 + 错题榜 ====== */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 用户列表表格 */}
          <div className="lg:col-span-3 bg-morandi-surface rounded-2xl p-5 shadow-sm border border-morandi-muted/60">
            <h2 className="text-base font-semibold text-morandi-text-main mb-3">
              📋 用户列表
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-morandi-muted/40 text-morandi-text-soft">
                    <th className="text-left py-2 pr-4 font-medium">用户名</th>
                    <th className="text-right py-2 px-2 font-medium">刷题数</th>
                    <th className="text-right py-2 px-2 font-medium">正确率</th>
                    <th className="text-right py-2 pl-2 font-medium hidden sm:table-cell">
                      注册时间
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.userList.map((u, i) => (
                    <tr
                      key={i}
                      className="border-b border-morandi-muted/20 hover:bg-morandi-bg/50 transition-colors"
                    >
                      <td className="py-2 pr-4 text-morandi-text-main">{u.username}</td>
                      <td className="py-2 px-2 text-right text-morandi-text-main">
                        {u.doneCount}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span
                          className={
                            u.accuracy >= 70
                              ? "text-morandi-success"
                              : u.accuracy >= 40
                                ? "text-morandi-primary"
                                : "text-morandi-danger"
                          }
                        >
                          {u.accuracy}%
                        </span>
                      </td>
                      <td className="py-2 pl-2 text-right text-morandi-text-soft hidden sm:table-cell">
                        {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                  {(!data || data.userList.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-morandi-text-soft">
                        暂无用户数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 高频错题榜 */}
          <div className="lg:col-span-2 bg-morandi-surface rounded-2xl p-5 shadow-sm border border-morandi-muted/60">
            <h2 className="text-base font-semibold text-morandi-text-main mb-3">
              🔥 高频错题 TOP 10
            </h2>
            <div className="space-y-2">
              {data?.wrongList.map((w, i) => (
                <div
                  key={w.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-morandi-bg/50
                             border border-morandi-muted/20 hover:border-morandi-danger/30
                             transition-colors"
                >
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                      ${i < 3 ? "bg-morandi-danger/20 text-morandi-danger" : "bg-morandi-muted/30 text-morandi-text-soft"}`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-morandi-text-main leading-relaxed break-words">
                      {w.text}
                    </p>
                    <p className="text-xs text-morandi-text-soft mt-0.5">
                      {typeLabel[w.type] || w.type} · 错 {w.wrongCount} 次
                    </p>
                  </div>
                </div>
              ))}
              {(!data || data.wrongList.length === 0) && (
                <p className="py-8 text-center text-morandi-text-soft text-sm">
                  暂无错题数据
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================================
// 统计卡片子组件
// ============================================================

function StatCard({
  label,
  value,
  subtitle,
  icon,
  color,
  textColor,
}: {
  label: string;
  value: number;
  subtitle?: string;
  icon: string;
  color: string;
  textColor: string;
}) {
  return (
    <div
      className={`rounded-2xl p-5 border ${color} flex items-center gap-4`}
    >
      <span className="text-3xl">{icon}</span>
      <div>
        <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
        <div className="text-sm text-morandi-text-soft">
          {label}
          {subtitle && (
            <span className="ml-1 text-xs text-morandi-text-soft/70">
              ({subtitle})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
