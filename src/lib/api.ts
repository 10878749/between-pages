import type { Book, Draw } from "../data/types";
export type Quota = {
  unlimited?: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  serverNow: number;
};
export type SavedDraw = {
  id: string;
  book: Book;
  draw: Draw;
  cached: boolean;
  mode?: "smart" | "light";
  unlocked?: boolean;
  diagnostic?: unknown;
};
export type DetailResult = {
  status: "ready" | "unconfigured" | "busy" | "limited" | "failed" | "locked";
  quota?: Quota;
  diagnostic?: unknown;
  unlocked?: boolean;
  message?: string;
  details?: {
    summary: string;
    authorBio: string;
    why: string;
    readingNote: string;
    sources: string[];
  };
};
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body
      ? { "Content-Type": "application/json", "X-Page-Request": "1" }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "暂时无法连接，请稍后再试。");
  return data;
}
export const session = () =>
  api<{
    quota: Quota;
    latest: SavedDraw | null;
    aiConfigured: boolean;
    smartAvailable?: boolean;
    locked?: boolean;
  }>("session");
