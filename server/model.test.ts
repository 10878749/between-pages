import { afterEach, expect, it, vi } from "vitest";
import { complete, configureModel, modelAvailable } from "./model";
afterEach(() => {
  configureModel("bigmodel");
  vi.unstubAllGlobals();
});
it("blocks Bailian requests until the free quota control is confirmed", async () => {
  configureModel("bailian", false);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(complete("JSON", {}, "test")).rejects.toThrow(
    "free_quota_setup",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("switches only to the approved snapshot and remembers exhausted models", async () => {
  configureModel("bailian", true, true);
  const models: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const model = JSON.parse(init.body as string).model;
      models.push(model);
      return model === "qwen-flash"
        ? new Response(
            JSON.stringify({ error: { code: "AllocationQuota.FreeTierOnly" } }),
            { status: 403 },
          )
        : new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"ok":true}' } }],
            }),
          );
    }),
  );
  expect(await complete("JSON", {}, "test")).toEqual({ ok: true });
  expect(await complete("JSON", {}, "test")).toEqual({ ok: true });
  expect(models).toEqual([
    "qwen-flash",
    "qwen-flash-2025-07-28",
    "qwen-flash-2025-07-28",
  ]);
  expect(modelAvailable()).toBe(true);
});
it("stops making paid-risk requests when both free quotas are exhausted", async () => {
  configureModel("bailian", true, true);
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ error: { code: "AllocationQuota.FreeTierOnly" } }),
        { status: 403 },
      ),
  );
  vi.stubGlobal("fetch", request);
  await expect(complete("JSON", {}, "test")).rejects.toThrow(
    "free_quota_exhausted",
  );
  expect(modelAvailable()).toBe(false);
  await expect(complete("JSON", {}, "test")).rejects.toThrow(
    "free_quota_exhausted",
  );
  expect(request).toHaveBeenCalledTimes(2);
});
it("sends the Bailian request to Beijing with non-thinking JSON output", async () => {
  configureModel("bailian", true);
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("qwen-flash");
    expect(body.enable_thinking).toBe(false);
    expect(body.thinking).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
    );
  });
  vi.stubGlobal("fetch", fetch);
  expect(await complete("return JSON", {}, "test")).toEqual({ ok: true });
});
it("does not retry exhausted free quota or fall back to another provider", async () => {
  configureModel("bailian", true);
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ error: { code: "AllocationQuota.FreeTierOnly" } }),
        { status: 403 },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(complete("JSON", {}, "test")).rejects.toThrow(
    "free_quota_exhausted",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
