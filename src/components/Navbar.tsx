"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import AppLink from "@/components/AppLink";
import { getSavedUsername, clearSavedUser } from "@/lib/api";

export default function Navbar() {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(getSavedUsername());
  }, []);

  // 监听 storage 变化（多标签页同步）
  useEffect(() => {
    const onStorage = () => setUsername(getSavedUsername());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = async () => {
    clearSavedUser();
    setUsername(null);
    // 调用 API 清除 httpOnly Cookie
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* ignore */ }
    window.location.href = "/";
  };

  const isAuthPage = pathname === "/login" || pathname === "/register";

  return (
    <nav className="sticky top-0 z-50 bg-morandi-surface/90 backdrop-blur border-b border-morandi-muted">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <AppLink
          href="/"
          className="text-lg font-semibold text-morandi-text-main tracking-tight hover:text-morandi-primary transition-colors cursor-pointer"
        >
          马克思主义原理 · 刷题
        </AppLink>
        <div className="flex items-center gap-3 text-sm">
          {username ? (
            <>
              <span className="text-morandi-text-soft">{username}</span>
              <button
                onClick={handleLogout}
                className="text-morandi-text-soft hover:text-morandi-danger transition-colors"
              >
                退出
              </button>
            </>
          ) : isAuthPage ? (
            // 已在登录/注册页 → 点登录无意义，不显示
            null
          ) : (
            <a
              href="/login"
              className="text-morandi-primary hover:text-morandi-text-main transition-colors cursor-pointer"
            >
              登录
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
