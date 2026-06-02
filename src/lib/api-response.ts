import { NextResponse } from "next/server";

/**
 * 统一成功响应
 */
export function success(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * 统一错误响应
 */
export function error(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
