"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import { apiRegister, saveUser } from "@/lib/api";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) { setError("请输入用户名"); return; }
    if (username.trim().length < 2) { setError("用户名至少 2 个字符"); return; }
    if (!password || password.length < 6) { setError("密码至少 6 位"); return; }

    setLoading(true);
    try {
      const res = await apiRegister(username.trim(), password);
      if (res.success && res.data) {
        saveUser({
          token: (res.data as Record<string, unknown>).token as string,
          userId: (res.data as Record<string, unknown>).userId as string,
          username: (res.data as Record<string, unknown>).username as string,
        });
        window.location.href = "/";
      } else {
        setError(res.error || "注册失败");
        setLoading(false);
      }
    } catch {
      setError("网络错误，请重试");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-morandi-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-morandi-text-main">创建账户</h1>
          <p className="text-morandi-text-soft mt-2 text-sm">注册后即可多端同步刷题进度</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-morandi-surface rounded-2xl p-6 shadow-sm border border-morandi-muted/60 space-y-4">
          <div>
            <label className="block text-sm font-medium text-morandi-text-soft mb-1.5">用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              autoComplete="username" placeholder="2-32 个字符"
              className="w-full px-4 py-2.5 text-base rounded-xl border border-morandi-muted bg-morandi-bg text-morandi-text-main placeholder:text-morandi-text-soft/50 focus:outline-none focus:ring-2 focus:ring-morandi-primary/40 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-morandi-text-soft mb-1.5">密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" placeholder="至少 6 位"
              className="w-full px-4 py-2.5 text-base rounded-xl border border-morandi-muted bg-morandi-bg text-morandi-text-main placeholder:text-morandi-text-soft/50 focus:outline-none focus:ring-2 focus:ring-morandi-primary/40 transition-all" />
          </div>
          {error && <p className="text-sm text-morandi-danger bg-morandi-danger/10 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-morandi-primary text-white font-medium text-base hover:opacity-90 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {loading ? "注册中..." : "注册"}
          </button>
          <p className="text-center text-sm text-morandi-text-soft">
            已有账户？ <AppLink href="/login" className="text-morandi-primary hover:underline font-medium">立即登录</AppLink>
          </p>
        </form>
      </div>
    </div>
  );
}
