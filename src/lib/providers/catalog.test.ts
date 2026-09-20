import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseOpenLibrary,
  parseGoogleBooks,
  searchCatalog,
  mergeBooks,
  validCatalog,
} from "./catalog";
import { recommend } from "../recommendation/recommendation";
import { seededRandom } from "../recommendation/random";
afterEach(() => vi.unstubAllGlobals());
const sample = {
  docs: [
    {
      key: "/works/OL123W",
      title: "外部测试书",
      author_name: ["作者甲"],
      subject: ["Science fiction"],
      first_publish_year: 1980,
    },
  ],
};
describe("external library", () => {
  it("parses only recognized records and maps explicit subjects", () => {
    const books = parseOpenLibrary(sample);
    expect(books).toHaveLength(1);
    expect(books[0].tags).toContain("科幻");
    expect(validCatalog(books)).toBe(true);
    expect(
      parseOpenLibrary({ docs: [{ key: "javascript:bad", title: "bad" }] }),
    ).toHaveLength(0);
    expect(parseOpenLibrary(null)).toHaveLength(0);
  });
  it("cleans untrusted descriptions and deduplicates editions", () => {
    const book = parseGoogleBooks({
      items: [
        {
          id: "abcd",
          volumeInfo: {
            title: "外部测试书",
            authors: ["作者甲"],
            description: "<p>简介</p><img src=x onerror=alert(1)>",
          },
        },
      ],
    })[0];
    expect(book.bookSummary).toBe("简介");
    expect(mergeBooks([...parseOpenLibrary(sample), book])).toHaveLength(1);
    expect(
      validCatalog([
        { ...book, source: { ...book.source, url: "javascript:bad" } },
      ]),
    ).toBe(false);
  });
  it("imported catalog participates in drawing", () => {
    const book = parseOpenLibrary(sample)[0];
    expect(recommend([], [], seededRandom(1), [book]).book.id).toBe(book.id);
  });
  it("retains results when a provider is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (url) =>
          String(url).includes("openlibrary")
            ? { ok: true, json: async () => sample }
            : { ok: false, status: 429 },
        ),
    );
    const result = await searchCatalog(
      "test-partial",
      1,
      new AbortController().signal,
    );
    expect(result.books).toHaveLength(1);
    expect(result.failed).toEqual(["Google Books"]);
  });
  it("rejects stale cancelled responses", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    await expect(
      searchCatalog("cancelled", 1, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
