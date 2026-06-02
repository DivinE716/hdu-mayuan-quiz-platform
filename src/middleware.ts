import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "marxism-practice-platform-secret",
);
const COOKIE_NAME = "auth_token";

// 需要登录才能访问的页面
const PROTECTED = ["/", "/practice", "/admin-dashboard"];

function isProtected(pathname: string): boolean {
  return PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"),
  );
}

async function getUserId(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return (payload.userId as string) || null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const userId = token ? await getUserId(token) : null;

  // ---- 已登录用户访问登录/注册页 → 跳首页 ----
  if (userId && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // ---- 受保护页面：未登录 → 跳登录页 ----
  if (isProtected(pathname) && !userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico
     * - api 路由（各 API 内部自行鉴权）
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
