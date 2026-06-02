import { NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 *
 * 清除 auth_token Cookie
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // 立即过期
  });

  return response;
}
