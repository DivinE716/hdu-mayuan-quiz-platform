/**
 * 前端 API 调用助手
 * 认证方式：Authorization: Bearer <token>（token 存 localStorage）
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---- Token 管理 ----

const USER_KEY = "mayuan_user";

function getToken(): string | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw).token || null;
  } catch { /* ignore */ }
  return null;
}

export function saveUser(user: { token: string; userId: string; username: string }): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* ignore */ }
}

export function getSavedUsername(): string | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw).username || null;
  } catch { /* ignore */ }
  return null;
}

export function clearSavedUser(): void {
  try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
}

// ---- 通用请求（自动带 token） ----

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...options, headers });
}

// ---- Auth ----

export async function apiRegister(username: string, password: string) {
  return authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }).then((r) => r.json() as Promise<ApiResponse>);
}

export async function apiLogin(username: string, password: string) {
  return authFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }).then((r) => r.json() as Promise<ApiResponse>);
}

// ---- Questions ----

export interface QuestionItem {
  id: string;
  type: "single" | "multiple" | "judge";
  questionText: string;
  options: string;
  answer: string;
  analysisText: string;
  isFavorite: boolean;
  wrongCount: number;
  isMastered: boolean;
}

export interface QuestionsData {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  questions: QuestionItem[];
}

export async function apiGetQuestions(params: {
  type?: string[];
  filter?: "wrong" | "favorite";
  order?: "asc" | "random";
  seed?: number;
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<QuestionsData>> {
  const sp = new URLSearchParams();
  if (params.type) params.type.forEach((t) => sp.append("type", t));
  if (params.filter) sp.set("filter", params.filter);
  if (params.order) sp.set("order", params.order);
  if (params.seed !== undefined) sp.set("seed", String(params.seed));
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  return authFetch(`/api/questions?${sp.toString()}`).then(
    (r) => r.json() as Promise<ApiResponse<QuestionsData>>,
  );
}

// ---- Progress Sync ----

export async function apiSyncProgress(items: { questionId: string; action: string }[]) {
  return authFetch("/api/progress/sync", {
    method: "POST",
    body: JSON.stringify({ items }),
  }).then((r) => r.json() as Promise<ApiResponse>);
}

// ---- Progress Stats ----

export interface StatsData {
  totalQuestions: number;
  attemptedCount: number;
  masteredCount: number;
  wrongCount: number;
  favoriteCount: number;
  accuracy: number;
}

export async function apiGetStats(): Promise<ApiResponse<StatsData>> {
  return authFetch("/api/progress/stats").then(
    (r) => r.json() as Promise<ApiResponse<StatsData>>,
  );
}

// ---- Settings (跨端位置同步) ----

export async function apiGetSetting(key: string): Promise<string | null> {
  return authFetch(`/api/settings?key=${encodeURIComponent(key)}`)
    .then((r) => r.json())
    .then((d) => (d.success ? d.data.value : null));
}

export async function apiSetSetting(key: string, value: string): Promise<void> {
  await authFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
}
