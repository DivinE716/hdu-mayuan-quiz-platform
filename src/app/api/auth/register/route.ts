import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { signToken, setAuthCookie } from "@/lib/auth";
import { success, error } from "@/lib/api-response";

/**
 * POST /api/auth/register
 *
 * Body: { username: string; password: string }
 *
 * 注册新用户，成功后自动签发 JWT 并写入 Cookie
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

    if (trimmedUsername.length < 2 || trimmedUsername.length > 32) {
      return error("用户名长度需在 2-32 个字符之间");
    }

    if (trimmedPassword.length < 6 || trimmedPassword.length > 128) {
      return error("密码长度需在 6-128 个字符之间");
    }

    // ---- 查重 ----
    const existing = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (existing) {
      return error("该用户名已被注册", 409);
    }

    // ---- 创建用户 ----
    const passwordHash = await hashPassword(trimmedPassword);

    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        passwordHash,
      },
    });

    // ---- 自动登录：签发 JWT（同时写 Cookie 兼容旧客户端） ----
    const token = signToken({ userId: user.id, username: user.username });
    await setAuthCookie(token);

    return success(
      {
        token,
        userId: user.id,
        username: user.username,
        createdAt: user.createdAt,
      },
      201,
    );
  } catch (err) {
    console.error("[register] error:", err);
    return error("服务器内部错误", 500);
  }
}
