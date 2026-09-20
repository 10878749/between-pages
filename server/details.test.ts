import { it, expect, vi, afterEach } from "vitest";
import { generateDetails, validateDetails } from "./details";
import { complete } from "./model";
import { chineseBooks } from "../src/lib/providers/discovery";
const book = chineseBooks({
  docs: [
    {
      key: "/works/OL123W",
      title: "山中来信",
      author_name: ["作者"],
      subject: ["fiction"],
    },
  ],
})[0];
const draw = {
  bookId: book.id,
  time: 0,
  selections: [{ id: "quiet", label: "安静", tagIds: ["安静"] }],
  matched: [],
  exploration: false,
};
const evidence = {
  summary:
    "这是一部以山村生活为题材的短篇小说集。人物在日常劳作、离别与重逢之中，试着理解身边的人。叙述缓慢，留意生活细节，几篇故事通过同一座村庄联系起来。",
  bio: "",
  sources: [book.source.url],
};
const output = {
  summary: evidence.summary,
  authorBio: "凭空伪造的著名获奖作家。",
  why: "你选了安静，这本短篇集把注意力放在日常劳作与人物关系上，缓慢的叙述提供了一种细看的读法。",
  readingNote: "先读一个短篇，留意人物如何通过日常的小事表达感情。",
  support: {
    summary: "以山村生活为题材的短篇小说集",
    authorBio: "伪造的资料",
    why: "叙述缓慢，留意生活细节",
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("accepts server-issued references without requiring English quotation copying", () => {
  expect(
    validateDetails(
      { ...output, support: { summary: "S1", why: "S1", authorBio: "" } },
      evidence,
      draw,
    ).summary,
  ).toBe(output.summary);
  expect(() =>
    validateDetails(
      { ...output, support: { summary: "S99", why: "S1" } },
      evidence,
      draw,
    ),
  ).toThrow();
  expect(() =>
    validateDetails(
      { ...output, support: { summary: "A1", why: "S1" } },
      { ...evidence, bio: "作者简介" },
      draw,
    ),
  ).toThrow();
});
it("preserves a checked synopsis if the interpretation fails twice", async () => {
  const invalidWhy = {
    ...output,
    why: "不支持的推荐理由",
    support: { summary: "S1", why: "invented" },
  };
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(invalidWhy) } }],
        }),
      ),
  );
  vi.stubGlobal("fetch", request);
  const result = await generateDetails(
    {
      ...book,
      sourceEvidence: { ...evidence, checkedAt: new Date().toISOString() },
    },
    draw,
    "test",
  );
  expect(result.summary).toBe(output.summary);
  expect(result.why).toContain("不足以确认");
  expect(request).toHaveBeenCalledTimes(2);
});
it("does not salvage an unsupported synopsis", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ...output,
                    support: { summary: "invented", why: "S1" },
                  }),
                },
              },
            ],
          }),
        ),
    ),
  );
  await expect(
    generateDetails(
      {
        ...book,
        sourceEvidence: { ...evidence, checkedAt: new Date().toISOString() },
      },
      draw,
      "test",
    ),
  ).rejects.toThrow("invalid_content_evidence");
});
it("repairs a wrongly attributed quote once without refetching verified evidence", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...output,
                  support: {
                    ...output.support,
                    why: "作者生平不能证明阅读体验",
                  },
                }),
              },
            },
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
        }),
      ),
    );
  vi.stubGlobal("fetch", request);
  const beforeAttempt = vi.fn();
  const result = await generateDetails(
    {
      ...book,
      sourceEvidence: { ...evidence, checkedAt: new Date().toISOString() },
    },
    draw,
    "test",
    undefined,
    beforeAttempt,
  );
  expect(result.why).toContain("安静");
  expect(request).toHaveBeenCalledTimes(2);
  expect(beforeAttempt).toHaveBeenCalledTimes(2);
});
it("uses source evidence, pins the free tier and discards unsupported biography", async () => {
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("open.bigmodel.cn")) {
      const p = JSON.parse(init!.body as string);
      expect(p.model).toBe("glm-4.7-flash");
      expect(p.tools).toBeUndefined();
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
        }),
      );
    }
    return new Response(
      JSON.stringify(
        url.includes("/works/") ? { description: evidence.summary } : {},
      ),
    );
  });
  vi.stubGlobal("fetch", request);
  const result = await generateDetails(book, draw, "test");
  expect(result.authorBio).toBe("");
  expect(result.why).toContain("安静");
});
it("does not call generation when no synopsis evidence exists", async () => {
  const request = vi.fn(
    async (url: string) => new Response(url.includes("/works/") ? "{}" : "{}"),
  );
  vi.stubGlobal("fetch", request);
  await expect(generateDetails(book, draw, "test")).rejects.toThrow(
    "insufficient_evidence",
  );
  expect(
    request.mock.calls.every((call) => !String(call[0]).includes("bigmodel")),
  ).toBe(true);
});
it.each([
  ["empty synopsis", { summary: "" }],
  ["too short synopsis", { summary: "这是一本书。" }],
  ["empty reason", { why: "" }],
  ["vague reason", { why: "这本书适合你。" }],
  [
    "wrong label",
    {
      why: "你希望探索宇宙奥秘，这本书的科学主题与广阔视野提供了丰富的知识，也引发关于未来的思考。",
    },
  ],
  ["empty advice", { readingNote: "" }],
  ["vague advice", { readingNote: "慢慢读。" }],
  [
    "invented quote",
    { support: { ...output.support, summary: "宇宙飞船穿过黑洞" } },
  ],
  [
    "invented relation",
    { support: { ...output.support, why: "主人公的太空冒险" } },
  ],
  ["missing citations", { support: undefined }],
  ["promotional", { why: output.why + "这本书与你完美契合。" }],
  ["destiny", { why: output.why + "这就是命中注定。" }],
  ["tailored", { summary: evidence.summary + "这是为你量身定制的。" }],
  ["marketing", { summary: evidence.summary + "开启旅程。" }],
  ["wrong type", { authorBio: 42 }],
  ["oversized", { summary: "字".repeat(801) }],
  ["null field", { readingNote: null }],
  ["array field", { why: [] }],
  ["blank quote", { support: { ...output.support, why: " " } }],
  ["tiny quote", { support: { ...output.support, summary: "这" } }],
])("quality gate rejects %s", (_name, change) => {
  expect(() =>
    validateDetails({ ...output, ...change }, evidence, draw),
  ).toThrow();
});
it("never retries authentication or switches to paid tier", async () => {
  const request = vi.fn(async () => new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", request);
  await expect(complete("system", {}, "test")).rejects.toThrow("invalid_key");
  expect(request).toHaveBeenCalledTimes(1);
});
it("honors long Retry-After without immediately retrying", async () => {
  const request = vi.fn(
    async () =>
      new Response("{}", { status: 429, headers: { "Retry-After": "30" } }),
  );
  vi.stubGlobal("fetch", request);
  await expect(complete("system", {}, "test")).rejects.toThrow(
    "generation_busy",
  );
  expect(request).toHaveBeenCalledTimes(1);
});
it("bounds transient retry and accounts for every provider attempt", async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      ),
    );
  vi.stubGlobal("fetch", request);
  const count = vi.fn();
  const pending = complete("system", {}, "test", count);
  await vi.runAllTimersAsync();
  expect(await pending).toEqual({ ok: true });
  expect(count).toHaveBeenCalledTimes(2);
});
