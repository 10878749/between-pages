import { describe, it, expect, vi, afterEach } from "vitest";
import { discover, discoveryQuery, chineseBooks } from "./discovery";
import { validCatalog } from "./catalog";
const data = {
  docs: [
    {
      key: "/works/OL123W",
      title: "English title",
      author_name: ["作者"],
      subject: ["fiction"],
      editions: { docs: [{ title: "中文书名", language: ["chi"] }] },
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
it("persists automatic records without promotional copy", () => {
  expect(validCatalog(JSON.parse(JSON.stringify(chineseBooks(data))))).toBe(
    true,
  );
});
describe("automatic remote discovery", () => {
  it("retrieves multiple pages of established Chinese editions", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetch);
    const r = await discover([], [], new AbortController().signal);
    expect(r.books[0].title).toBe("中文书名");
    expect(r.cached).toBe(false);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("sort")).toBe("editions");
    expect(url.searchParams.get("q")).toContain("edition_count:[3 TO *]");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(url.searchParams.get("q")).toContain("language:chi");
  });
  it("maps clues to subject query without user search", () => {
    expect(
      discoveryQuery([{ id: "x", label: "远方", tagIds: ["想离开现实"] }]),
    ).toContain("fantasy");
  });
  it("uses only cached Chinese external books offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const cached = chineseBooks(data);
    expect(
      (await discover([], cached, new AbortController().signal)).cached,
    ).toBe(true);
    await expect(
      discover([], [], new AbortController().signal),
    ).rejects.toThrow("暂时连不上书库");
  });
  it("cancelled results cannot replace a later round", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("abort")));
    await expect(discover([], [], controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
