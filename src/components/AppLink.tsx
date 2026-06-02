"use client";

import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

interface AppLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
}

/**
 * 移动端兼容导航链接
 * 只用 onClick——React 已处理移动端 touch 事件，同时绑 onTouchEnd 会触发两次
 */
export default function AppLink({
  href,
  replace = false,
  children,
  className,
  ...rest
}: AppLinkProps) {
  const router = useRouter();

  const navigate = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      if (replace) {
        router.replace(href);
      } else {
        router.push(href);
      }
    } catch {
      // router 异常时回退到整页跳转
      window.location.href = href;
    }
  };

  return (
    <a
      href={href}
      onClick={navigate}
      className={className}
      {...rest}
    >
      {children}
    </a>
  );
}
