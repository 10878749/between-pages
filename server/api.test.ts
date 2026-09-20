import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, WINDOW, period, day } from "./store";
import { createApi } from "./api";
import { chineseBooks } from "../src/lib/providers/discovery";
const book = chineseBooks({
  docs: [
    {
      key: "/works/OL123W",
      title: "测试书",
      author_name: ["作者"],
      subject: ["fiction"],
    },
  ],
})[0];
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
});
async function setup(key = "test-key", unlimited = false) {
  const store = new Store(undefined, unlimited);
  const discover = vi.fn(async () => ({
    books: [book],
    cached: false,
    broadened: false,
  }));
  const generateDetails = vi.fn(async () => ({
    summary: "已核实的简介",
    authorBio: "",
    why: "阅读建议",
    readingNote: "慢慢读",
    sources: [book.source.url],
  }));
  const selectBook = vi.fn(async () => ({
    book,
    matched: [],
    exploration: false,
    rankings: [],
    reason: "测试",
  }));
  const gatherEvidence = vi.fn(async () => ({
    summary:
      "这是一部小说，描写普通人的生活与相互理解，在几段相互关联的故事里展开人物的选择和处境。故事从家庭与邻里的日常出发，讨论个人愿望与现实生活之间的矛盾。",
    bio: "",
    sources: [],
  }));
  const handler = createApi(
    store,
    key,
    { discover, generateDetails, selectBook, gatherEvidence },
    unlimited ? "private-test-pass" : "",
  );
  const server = createServer(
    (req, res) => void handler(req, res, () => res.end()),
  );
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  async function visitor() {
    const r = await fetch(base + "/api/session");
    return r.headers.get("set-cookie")!.split(";")[0];
  }
  const cookie = await visitor();
  async function call(path: string, body?: unknown, identity = cookie) {
    const r = await fetch(base + "/api/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        cookie: identity,
        "X-Page-Request": "1",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  }
  return {
    store,
    discover,
    generateDetails,
    selectBook,
    gatherEvidence,
    visitor,
    cookie,
    call,
    base,
  };
}
describe("server draw budget", () => {
  it("resets at Beijing 00/08/16 without rollover", () => {
    const s = new Store();
    const end = Date.parse("2026-09-20T07:59:59+08:00");
    s.reserve("a", "1", end);
    s.reserve("a", "1", end);
    expect(s.quota("a", end).remaining).toBe(4);
    s.fail("a", "1");
    s.reserve("a", "2", end);
    expect(s.quota("a", end + 1000).remaining).toBe(5);
    expect(s.quota("a", end).resetAt).toBe(end + 1000);
    expect(period(end + 1000) - period(end)).toBe(1);
    expect(day(Date.parse("2026-09-20T00:00:00+08:00"))).toBe("2026-09-20");
    expect(WINDOW).toBe(28800000);
  });
  it("persists successful draws and releases interrupted reservations after restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "pages-quota-"));
    try {
      const file = join(dir, "state.json");
      const a = new Store(file);
      a.reserve("u", "a");
      a.finish(
        "u",
        "a",
        book,
        {
          bookId: book.id,
          time: Date.now(),
          selections: [],
          matched: [],
          exploration: true,
        },
        false,
      );
      a.reserve("u", "b");
      const b = new Store(file);
      expect(b.quota("u").remaining).toBe(4);
      expect(b.latest("u")?.id).toBe("a");
      expect(b.state.secret).toBe(a.state.secret);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("deduplicates simultaneous requests, enforces five successful draws, isolates visitors", async () => {
    const t = await setup();
    const id = randomUUID();
    const results = await Promise.all([
      t.call("draw", { id, clues: [] }),
      t.call("draw", { id, clues: [] }),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(t.discover).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++)
      await t.call("draw", { id: randomUUID(), clues: [] });
    expect((await t.call("draw", { id: randomUUID(), clues: [] })).status).toBe(
      429,
    );
    expect((await t.call("draw", { id, clues: [] })).status).toBe(200);
    expect((await t.call("session")).data.latest.id).toBeTruthy();
    const other = await t.visitor();
    expect(
      (await t.call("session", undefined, other)).data.quota.remaining,
    ).toBe(5);
    expect((await t.call("details", { id }, other)).status).toBe(404);
  });
  it("blocks overlapping different reservations and refunds library failure", async () => {
    const t = await setup();
    let finish!: () => void;
    t.discover.mockImplementationOnce(async () => {
      await new Promise<void>((r) => (finish = r));
      throw Error("offline");
    });
    const first = t.call("draw", { id: randomUUID(), clues: [] });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect((await t.call("draw", { id: randomUUID(), clues: [] })).status).toBe(
      409,
    );
    finish();
    expect((await first).status).toBe(503);
    expect((await t.call("session")).data.quota.remaining).toBe(5);
  });
  it("rejects untrusted requests and forged identity", async () => {
    const t = await setup();
    const r = await fetch(t.base + "/api/draw", {
      method: "POST",
      headers: { cookie: t.cookie },
      body: "{}",
    });
    expect(r.status).toBe(403);
    expect(
      (
        await t.call(
          "draw",
          { id: randomUUID(), clues: [] },
          "bp_visitor=forged",
        )
      ).status,
    ).toBe(401);
  });
  it("light mode never calls a model, and upgrade without key is not charged", async () => {
    const t = await setup("");
    const id = randomUUID();
    await t.call("draw", { id, clues: [], mode: "light" });
    expect((await t.call("details", { id, upgrade: true })).data.status).toBe(
      "unconfigured",
    );
    expect(t.generateDetails).not.toHaveBeenCalled();
    expect((await t.call("session")).data.quota.remaining).toBe(5);
  });
  it("caches generation, has no global daily cap and one concurrent generation", async () => {
    const t = await setup("test-key");
    const id = randomUUID();
    await t.call("draw", { id, clues: [] });
    let finish!: () => void;
    t.generateDetails.mockImplementationOnce(async () => {
      await new Promise<void>((r) => (finish = r));
      return {
        summary: "简介",
        authorBio: "",
        why: "理由",
        readingNote: "建议",
        sources: [],
      };
    });
    const first = t.call("details", { id });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect((await t.call("details", { id })).data.status).toBe("busy");
    finish();
    expect((await first).data.status).toBe("ready");
    expect((await t.call("details", { id })).data.status).toBe("ready");
    expect(t.generateDetails).toHaveBeenCalledTimes(1);
    t.store.change((s) => {
      s.contexts = {};
      s.daily[day(Date.now())] = 100;
    });
    const second = randomUUID();
    await t.call("draw", { id: second, clues: [], mode: "light" });
    expect(
      (await t.call("details", { id: second, upgrade: true })).data.status,
    ).toBe("ready");
    expect(t.generateDetails).toHaveBeenCalledTimes(2);
  });
});

it("light draws never rank or generate, even after normal quota is exhausted", async () => {
  const t = await setup();
  for (let i = 0; i < 5; i++)
    await t.call("draw", { id: randomUUID(), clues: [] });
  t.selectBook.mockClear();
  t.generateDetails.mockClear();
  for (let i = 0; i < 4; i++) {
    const id = randomUUID();
    expect(
      (await t.call("draw", { id, clues: [], mode: "light" })).status,
    ).toBe(200);
    expect((await t.call("details", { id })).data.status).toBe("locked");
  }
  expect(t.selectBook).not.toHaveBeenCalled();
  expect(t.generateDetails).not.toHaveBeenCalled();
});
it("allows one fresh generation after a details validator upgrade", async () => {
  const t = await setup();
  const id = randomUUID();
  await t.call("draw", { id, clues: [] });
  for (const d of Object.values(t.store.state.draws)) {
    d.attempts = 3;
    d.attemptDay = day(Date.now());
    d.lastAttempt = Date.now();
    d.detailsVersion = "editorial-v4";
  }
  expect((await t.call("details", { id })).data.status).toBe("ready");
  expect((await t.call("details", { id })).data.status).toBe("ready");
  expect(t.generateDetails).toHaveBeenCalledTimes(1);
});
it.each(["smart", "light"])(
  "rejects records without content before %s delivery",
  async (mode) => {
    const t = await setup();
    t.gatherEvidence.mockResolvedValue({ summary: "", bio: "", sources: [] });
    const result = await t.call("draw", { id: randomUUID(), clues: [], mode });
    expect(result.status).toBe(503);
    expect(result.data.error).toContain("不够合适");
    expect(t.selectBook).not.toHaveBeenCalled();
    expect(t.generateDetails).not.toHaveBeenCalled();
    expect((await t.call("session")).data.quota.remaining).toBe(5);
  },
);
it("light upgrade is opt-in, consumes once and stays unlocked after reload", async () => {
  const t = await setup();
  const id = randomUUID();
  await t.call("draw", { id, clues: [], mode: "light" });
  expect((await t.call("details", { id, peek: true })).data.status).toBe(
    "locked",
  );
  expect(t.generateDetails).not.toHaveBeenCalled();
  expect((await t.call("details", { id, upgrade: true })).data.status).toBe(
    "ready",
  );
  expect((await t.call("session")).data.quota.remaining).toBe(4);
  expect((await t.call("details", { id, upgrade: true })).data.status).toBe(
    "ready",
  );
  const second = randomUUID();
  await t.call("draw", { id: second, clues: [], mode: "light" });
  expect(
    (await t.call("details", { id: second, peek: true })).data.status,
  ).toBe("ready");
  expect(t.generateDetails).toHaveBeenCalledTimes(1);
  expect((await t.call("session")).data.quota.remaining).toBe(4);
  const other = await t.visitor();
  const third = randomUUID();
  await t.call("draw", { id: third, clues: [], mode: "light" }, other);
  expect(
    (await t.call("details", { id: third, peek: true }, other)).data.status,
  ).toBe("locked");
  await t.call("details", { id: third, upgrade: true }, other);
  expect((await t.call("session", undefined, other)).data.quota.remaining).toBe(
    4,
  );
  expect(t.generateDetails).toHaveBeenCalledTimes(1);
});
it("failed upgrade refunds; invalid smart selection refunds without silently drawing", async () => {
  const t = await setup();
  const id = randomUUID();
  await t.call("draw", { id, clues: [], mode: "light" });
  t.generateDetails.mockRejectedValueOnce(Error("insufficient_evidence"));
  expect((await t.call("details", { id, upgrade: true })).data.status).toBe(
    "failed",
  );
  expect((await t.call("session")).data.quota.remaining).toBe(5);
  t.selectBook.mockRejectedValueOnce(Error("invalid_ranking"));
  expect((await t.call("draw", { id: randomUUID(), clues: [] })).status).toBe(
    503,
  );
  expect((await t.call("session")).data.quota.remaining).toBe(5);
});
it("private mode requires an independent credential and query flags cannot bypass it", async () => {
  const t = await setup("test", true);
  expect((await t.call("session")).data.locked).toBe(true);
  expect(
    (await t.call("draw?unlimited=true", { id: randomUUID(), clues: [] }))
      .status,
  ).toBe(403);
  expect((await t.call("unlock", { code: "wrong" })).status).toBe(403);
  const response = await fetch(t.base + "/api/unlock", {
    method: "POST",
    headers: {
      cookie: t.cookie,
      "X-Page-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: "private-test-pass" }),
  });
  const identity =
    t.cookie + "; " + response.headers.get("set-cookie")!.split(";")[0];
  for (let i = 0; i < 4; i++)
    expect(
      (await t.call("draw", { id: randomUUID(), clues: [] }, identity)).status,
    ).toBe(200);
  expect(
    (await t.call("session", undefined, identity)).data.quota.unlimited,
  ).toBe(true);
  const other = await t.visitor();
  expect((await t.call("session", undefined, other)).data.locked).toBe(true);
});
