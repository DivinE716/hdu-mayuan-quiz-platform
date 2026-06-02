"use client";

import { useState, useEffect } from "react";
import AppLink from "@/components/AppLink";
import { getSavedUsername, clearSavedUser } from "@/lib/api";

export default function Navbar() {
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

  const handleLogout = () => {
    clearSavedUser();
    setUsername(null);
    window.location.href = "/";
  };

  return (
    <nav className="sticky top-0 z-50 bg-morandi-surface/90 backdrop-blur border-b border-morandi-muted">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <AppLink href="/" className="text-lg font-semibold text-morandi-text-main tracking-tight hover:text-morandi-primary transition-colors cursor-pointer">
          马克思主义原理 · 刷题
        </AppLink>
        <div className="flex items-center gap-3 text-sm">
          {username ? (
            <>
              <span className="text-morandi-text-soft">{username}</span>
              <button onClick={handleLogout} className="text-morandi-text-soft hover:text-morandi-danger transition-colors">
                退出
              </button>
            </>
          ) : (
            <AppLink href="/login" className="text-morandi-primary hover:text-morandi-text-main transition-colors cursor-pointer">
              登录
            </AppLink>
          )}
        </div>
      </div>
    </nav>
  );
}
