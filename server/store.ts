import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Book, Draw, Selection } from "../src/data/types";
import type { CatalogBook } from "../src/lib/providers/catalog";
export type SavedDraw = {
  mode?: "smart" | "light";
  phase?: string;
  diagnostic?: unknown;
  id: string;
  owner: string;
  window: number;
  state: "pending" | "done" | "failed";
  time: number;
  book?: Book;
  draw?: Draw;
  cached?: boolean;
  attempts: number;
  detailsVersion?: string;
  attemptDay?: string;
  lastAttempt?: number;
};
export type Details = {
  summary: string;
  authorBio: string;
  why: string;
  readingNote: string;
  sources: string[];
};
export type State = {
  upgrades: Record<
    string,
    { owner: string; window: number; state: "pending" | "done" | "failed" }
  >;
  unlocked: Record<string, boolean>;
  secret: string;
  draws: Record<string, SavedDraw>;
  books: CatalogBook[];
  contexts: Record<string, Details>;
  daily: Record<string, number>;
};
export const WINDOW = 8 * 60 * 60 * 1000;
export function period(now: number) {
  return Math.floor(now / WINDOW);
}
export function day(now: number) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export class Store {
  state: State;
  constructor(
    private path?: string,
    public unlimited = false,
  ) {
    this.state =
      path && existsSync(path)
        ? JSON.parse(readFileSync(path, "utf8"))
        : {
            secret: randomBytes(32).toString("hex"),
            draws: {},
            books: [],
            contexts: {},
            daily: {},
            upgrades: {},
            unlocked: {},
          };
    // A single local server owns this file. Interrupted reservations never charge a draw.
    this.change((s) => {
      s.upgrades ??= {};
      s.unlocked ??= {};
      for (const u of Object.values(s.upgrades))
        if (u.state === "pending") u.state = "failed";
      for (const d of Object.values(s.draws))
        if (d.state === "pending") d.state = "failed";
    });
  }
  change<T>(fn: (s: State) => T): T {
    const next = structuredClone(this.state);
    const result = fn(next);
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path + ".tmp", JSON.stringify(next), { mode: 0o600 });
      renameSync(this.path + ".tmp", this.path);
    }
    this.state = next;
    return result;
  }
  quota(owner: string, now = Date.now()) {
    const used =
      Object.values(this.state.draws).filter(
        (d) =>
          d.owner === owner &&
          d.mode !== "light" &&
          d.window === period(now) &&
          d.state !== "failed",
      ).length +
      Object.values(this.state.upgrades).filter(
        (u) =>
          u.owner === owner && u.window === period(now) && u.state !== "failed",
      ).length;
    return {
      remaining: this.unlimited ? 5 : Math.max(0, 5 - used),
      unlimited: this.unlimited,
      limit: 5,
      resetAt: (period(now) + 1) * WINDOW,
      serverNow: now,
    };
  }
  reserve(
    owner: string,
    id: string,
    now = Date.now(),
    mode: "smart" | "light" = "smart",
  ) {
    const key = owner + ":" + id,
      previous = this.state.draws[key];
    if (previous && previous.state !== "failed") return previous;
    if (
      Object.values(this.state.draws).some(
        (d) => d.owner === owner && d.state === "pending",
      )
    )
      throw new Error("pending");
    if (mode === "smart" && this.quota(owner, now).remaining === 0)
      throw new Error("quota");
    return this.change(
      (s) =>
        (s.draws[key] = {
          id,
          owner,
          window: period(now),
          state: "pending",
          time: now,
          attempts: 0,
          mode,
        }),
    );
  }
  reserveUpgrade(owner: string, bookId: string) {
    const key = owner + ":" + bookId;
    if (this.state.unlocked[key]) return;
    if (this.state.upgrades[key]?.state === "pending")
      throw new Error("pending");
    if (!this.quota(owner).remaining) throw new Error("quota");
    this.change((s) => {
      s.upgrades[key] = { owner, window: period(Date.now()), state: "pending" };
    });
  }
  finishUpgrade(owner: string, bookId: string, success: boolean) {
    this.change((s) => {
      const key = owner + ":" + bookId;
      if (s.upgrades[key]?.state === "pending")
        s.upgrades[key].state = success ? "done" : "failed";
      if (success) s.unlocked[key] = true;
    });
  }
  finish(owner: string, id: string, book: Book, draw: Draw, cached: boolean) {
    this.change((s) => {
      const d = s.draws[owner + ":" + id];
      if (!d || d.state !== "pending") throw new Error("reservation");
      Object.assign(d, { book, draw, cached, state: "done" });
    });
  }
  fail(owner: string, id: string) {
    this.change((s) => {
      const d = s.draws[owner + ":" + id];
      if (d?.state === "pending") d.state = "failed";
    });
  }
  latest(owner: string) {
    return Object.values(this.state.draws)
      .filter((d) => d.owner === owner && d.state === "done")
      .sort((a, b) => b.time - a.time)[0];
  }
}
export function selections(value: unknown): Selection[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error("invalid");
  return value.map((v) => {
    if (
      !v ||
      typeof v.id !== "string" ||
      typeof v.label !== "string" ||
      v.id.length > 100 ||
      v.label.length > 60 ||
      !Array.isArray(v.tagIds) ||
      v.tagIds.length > 20 ||
      v.tagIds.some((t: unknown) => typeof t !== "string" || t.length > 80)
    )
      throw new Error("invalid");
    return { id: v.id, label: v.label, tagIds: v.tagIds };
  });
}
