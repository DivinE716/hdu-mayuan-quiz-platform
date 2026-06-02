import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword } from "@/lib/password";
import { signToken, setAuthCookie } from "@/lib/auth";
import { success, error } from "@/lib/api-response";

/**
 * POST /api/auth/login
 *
 * Body: { username: string; password: string }
 *
 * 验证用户名密码，成功后签发 JWT 并写入 Cookie
 */
export async function POST(request: NextRequest) {
  try {
    let body: { username?: string; password?: string };
    try {
      const text = await request.text();
      body = JSON.parse(text);
    } catch {
      return error("请求格式错误，请发送有效的 JSON", 400);
    }

    const { username, password } = body;

    // ---- 参数校验 ----
    if (!username || !password) {
      return error("用户名和密码不能为空");
    }

    const trimmedUsername = String(username).trim();
    const trimmedPassword = String(password).trim();

    // ---- 查找用户 ----
    const user = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (!user) {
      return error("用户名或密码错误", 401);
    }

    // ---- 验证密码 ----
    const valid = await comparePassword(trimmedPassword, user.passwordHash);

    if (!valid) {
      return error("用户名或密码错误", 401);
    }

    // ---- 签发 JWT（同时写 Cookie 兼容旧客户端） ----
    const token = signToken({ userId: user.id, username: user.username });
    await setAuthCookie(token);

    return success({
      token,
      userId: user.id,
      username: user.username,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error("[login] error:", err);
    return error("服务器内部错误", 500);
  }
}
