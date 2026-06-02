import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";

// ---- 配置 ----

const JWT_SECRET = process.env.JWT_SECRET || "marxism-practice-platform-secret";
const JWT_EXPIRES_IN = "7d";
const COOKIE_NAME = "auth_token";

// ---- 类型 ----

export interface JwtPayload {
  userId: string;
  username: string;
}

// ---- Token 签发 ----

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// ---- Token 验证 ----

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// ---- 从请求中提取当前用户（优先 Authorization header） ----

export async function getAuthUser(): Promise<JwtPayload | null> {
  // 1. 优先从 Authorization header 读取
  const headersList = await headers();
  const authHeader = headersList.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const user = verifyToken(authHeader.slice(7));
    if (user) return user;
  }

  // 2. 回退：从 Cookie 读取（兼容旧客户端）
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token) {
      const user = verifyToken(token);
      if (user) return user;
    }
  } catch {
    // cookies() 可能在非请求上下文调用，忽略
  }

  return null;
}

// ---- Cookie 操作（保留兼容，但不再强制依赖） ----

export async function setAuthCookie(token: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch {
    // cookies() 不可用时忽略
  }
}
