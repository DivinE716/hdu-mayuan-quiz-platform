"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import { apiLogin, saveUser } from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("请填写用户名和密码");
      return;
    }

    setLoading(true);
    try {
      const res = await apiLogin(username.trim(), password.trim());
      if (res.success && res.data) {
        // 保存 token + 用户信息到 localStorage
        saveUser({
          token: (res.data as Record<string, unknown>).token as string,
          userId: (res.data as Record<string, unknown>).userId as string,
          username: (res.data as Record<string, unknown>).username as string,
        });
        // 整页跳转，加载最新资源
        window.location.href = "/";
      } else {
        setError(res.error || "登录失败");
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
          <h1 className="text-2xl font-bold text-morandi-text-main">欢迎回来</h1>
          <p className="text-morandi-text-soft mt-2 text-sm">登录以同步你的刷题进度</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-morandi-surface rounded-2xl p-6 shadow-sm border border-morandi-muted/60 space-y-4">
          <div>
            <label className="block text-sm font-medium text-morandi-text-soft mb-1.5">用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              autoComplete="username" placeholder="请输入用户名"
              className="w-full px-4 py-2.5 text-base rounded-xl border border-morandi-muted bg-morandi-bg text-morandi-text-main placeholder:text-morandi-text-soft/50 focus:outline-none focus:ring-2 focus:ring-morandi-primary/40 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-morandi-text-soft mb-1.5">密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="请输入密码"
              className="w-full px-4 py-2.5 text-base rounded-xl border border-morandi-muted bg-morandi-bg text-morandi-text-main placeholder:text-morandi-text-soft/50 focus:outline-none focus:ring-2 focus:ring-morandi-primary/40 transition-all" />
          </div>
          {error && <p className="text-sm text-morandi-danger bg-morandi-danger/10 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-morandi-primary text-white font-medium text-base hover:opacity-90 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {loading ? "登录中..." : "登录"}
          </button>
          <p className="text-center text-sm text-morandi-text-soft">
            还没有账户？ <AppLink href="/register" className="text-morandi-primary hover:underline font-medium">立即注册</AppLink>
          </p>
        </form>
      </div>
    </div>
  );
}
