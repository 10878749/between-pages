import { it, expect } from "vitest";
import { Miniflare, createFetchMock } from "miniflare";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chineseBooks } from "../src/lib/providers/discovery";
import { period } from "./store";
import { PublicDatabase, type Database } from "./database";

it("public Worker persists five-use quota, keeps light available after exhaustion, blocks private access and concurrent writes", async () => {
  const mock = createFetchMock();
  mock.disableNetConnect();
  const mf = new Miniflare({
    modules: true,
    scriptPath: "dist/server/index.js",
    compatibilityDate: "2025-06-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    fetchMock: mock,
    bindings: {
      DASHSCOPE_API_KEY: "test-never-sent",
      BAILIAN_FREE_QUOTA_CONFIRMED: "true",
      BAILIAN_FALLBACK_FREE_QUOTA_CONFIRMED: "true",
    },
    serviceBindings: { ASSETS: () => new Response("<!doctype html>test") },
  });
  try {
    const db = await mf.getD1Database("DB");
    for (const sql of readFileSync(
      "drizzle/0000_slimy_hardball.sql",
      "utf8",
    ).split("--> statement-breakpoint"))
      await db.prepare(sql).run();
    const first = await mf.dispatchFetch("https://pages.test/api/session");
    expect(first.status).toBe(200);
    expect(
      ((await first.clone().json()) as { quota: { remaining: number } }).quota
        .remaining,
    ).toBe(5);
    const cookie = first.headers.get("set-cookie")!.split(";")[0],
      owner = cookie.split("=")[1].split(".")[0];
    expect(first.headers.get("set-cookie")).toContain("Secure");
    const call = (path: string, body?: unknown) =>
      mf.dispatchFetch("https://pages.test/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          cookie,
          Origin: "https://pages.test",
          "X-Page-Request": "1",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    for (let i = 0; i < 5; i++)
      await db
        .prepare("INSERT INTO entries (key,value) VALUES (?,?)")
        .bind(
          "draws:" + owner + ":" + i,
          JSON.stringify({
            id: String(i),
            owner,
            window: period(Date.now()),
            state: "done",
            time: Date.now(),
            attempts: 0,
            mode: "smart",
          }),
        )
        .run();
    expect(
      (
        (await (await call("session")).json()) as {
          quota: { remaining: number };
        }
      ).quota.remaining,
    ).toBe(0);
    expect((await call("draw", { id: randomUUID(), clues: [] })).status).toBe(
      429,
    );
    expect((await call("unlock", { code: "anything" })).status).toBe(404);
    const session = (await (await call("session?unlimited=true")).json()) as {
      quota: { unlimited: boolean };
    };
    expect(session.quota.unlimited).toBe(false);
    await db
      .prepare("UPDATE control SET models = ? WHERE id = 1")
      .bind(JSON.stringify(["qwen-flash", "qwen-flash-2025-07-28"]))
      .run();
    expect(
      ((await (await call("session")).json()) as { smartAvailable: boolean })
        .smartAvailable,
    ).toBe(false);
    const book = chineseBooks({
      docs: [
        {
          key: "/works/OL123W",
          title: "测试小说",
          author_name: ["测试作者"],
          subject: ["fiction"],
        },
      ],
    })[0];
    book.bookSummary =
      "这是一部小说，描写普通人的生活与相互理解，在几段相互关联的故事里展开人物的选择和处境。故事从家庭与邻里的日常出发，讨论个人愿望与现实生活之间的矛盾。";
    book.sourceEvidence = {
      summary: book.bookSummary,
      bio: "",
      sources: [],
      checkedAt: new Date().toISOString(),
    };
    await db
      .prepare("INSERT INTO entries (key,value) VALUES (?,?)")
      .bind("books:0", JSON.stringify(book))
      .run();
    const light = await call("draw", {
      id: randomUUID(),
      clues: [],
      mode: "light",
    });
    const result = (await light.json()) as {
      quota: { remaining: number };
      result?: { diagnostic?: unknown };
    };
    expect(light.status, JSON.stringify(result)).toBe(200);
    expect(result.quota.remaining).toBe(0);
    expect(result.result?.diagnostic).toBeUndefined();
    await db
      .prepare("UPDATE control SET lease = ?, lease_until = ? WHERE id = 1")
      .bind("v2:held", Date.now() + 60000)
      .run();
    expect(
      (await call("draw", { id: randomUUID(), clues: [], mode: "light" }))
        .status,
    ).toBe(429);
    expect((await call("session")).status).toBe(200);
    const adapter = new PublicDatabase(db as unknown as Database);
    expect(await adapter.acquire()).toBeNull();
    await db
      .prepare("UPDATE control SET lease_until = ? WHERE id = 1")
      .bind(Date.now() - 1)
      .run();
    await expect(adapter.heartbeat("v2:held")).rejects.toThrow("lease_lost");
    const next = await adapter.acquire();
    expect(next).toMatch(/^v2:/);
    await adapter.release("v2:held");
    expect((await adapter.control()).lease).toBe(next);
    const loaded = await adapter.load((await adapter.control()).secret);
    await expect(
      adapter.save(loaded.state, new Map(), "v2:held", []),
    ).rejects.toThrow("lease_lost");
    await adapter.release(next!);
    // Upgrade immediately recovers the old ten-minute lock, without resetting successful draws.
    await db
      .prepare("UPDATE control SET lease = ?, lease_until = ? WHERE id = 1")
      .bind("legacy-lock", Date.now() + 600000)
      .run();
    const recovered = await adapter.acquire();
    expect(recovered).toMatch(/^v2:/);
    expect(
      (await adapter.control()).lease_until - Date.now(),
    ).toBeLessThanOrEqual(30000);
    await adapter.release(recovered!);
    const freshSession = await mf.dispatchFetch(
      "https://pages.test/api/session",
    );
    const freshCookie = freshSession.headers.get("set-cookie")!.split(";")[0];
    const freshOwner = freshCookie.split("=")[1].split(".")[0];
    const orphanKey = "draws:" + freshOwner + ":interrupted";
    await db
      .prepare("INSERT INTO entries (key,value) VALUES (?,?)")
      .bind(
        orphanKey,
        JSON.stringify({
          id: "interrupted",
          owner: freshOwner,
          window: period(Date.now()),
          state: "pending",
          time: Date.now(),
          attempts: 0,
          mode: "smart",
        }),
      )
      .run();
    const recoveredSession = await mf.dispatchFetch(
      "https://pages.test/api/session",
      { headers: { cookie: freshCookie } },
    );
    expect(
      ((await recoveredSession.json()) as { quota: { remaining: number } })
        .quota.remaining,
    ).toBe(5);
    const retry = await mf.dispatchFetch("https://pages.test/api/draw", {
      method: "POST",
      headers: {
        cookie: freshCookie,
        Origin: "https://pages.test",
        "X-Page-Request": "1",
      },
      body: JSON.stringify({ id: randomUUID(), clues: [], mode: "light" }),
    });
    expect(retry.status).toBe(200);
    const orphan = await db
      .prepare("SELECT value FROM entries WHERE key = ?")
      .bind(orphanKey)
      .first<{ value: string }>();
    expect(JSON.parse(orphan!.value).state).toBe("failed");
    expect(
      (await mf.dispatchFetch("https://pages.test/.env.local")).status,
    ).toBe(404);
    expect((await mf.dispatchFetch("https://pages.test/")).status).toBe(200);
  } finally {
    await mf.dispose();
  }
}, 30000);
