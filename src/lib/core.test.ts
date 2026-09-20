import { describe, it, expect, vi, afterEach } from "vitest";
import { books } from "../data/books";
import { authors } from "../data/authors";
import { tags, selectionFor } from "../data/tags";
import { LocalTagInterpreter } from "./recommendation/tagInterpreter";
import { recommend } from "./recommendation/recommendation";
import { seededRandom } from "./recommendation/random";
import { getAvailability } from "./providers/availability";
import { GoogleBooksProvider } from "./providers/googleBooks";
import { OpenLibraryProvider } from "./providers/openLibrary";
const interpreter = new LocalTagInterpreter();
afterEach(() => vi.unstubAllGlobals());
describe("curated collection", () => {
  it("has diverse complete records", () => {
    expect(books.length).toBeGreaterThanOrEqual(30);
    expect(tags.length).toBeGreaterThanOrEqual(80);
    expect(tags.length).toBeLessThanOrEqual(120);
    expect(tags.filter((t) => t.category === "personality")).toHaveLength(16);
    expect(books.some((b) => b.title === "夏日之书")).toBe(true);
    for (const b of books) {
      expect(authors[b.authorId]).toBeDefined();
      expect(b.bookSummary.length).toBeGreaterThanOrEqual(70);
      expect(b.bookSummary.length).toBeLessThanOrEqual(130);
    }
  });
});
describe("custom clues", () => {
  it("normalizes, maps aliases, preserves text", async () => {
    const r = await interpreter.interpret("  像做梦！ ");
    expect(r.originalText).toBe("  像做梦！ ");
    expect(r.normalizedText).toBe("像做梦");
    expect(r.mappedTagIds).toContain("梦境");
    expect((await interpreter.interpret("阴湿")).mappedTagIds).toContain(
      "雨夜",
    );
  });
  it("handles negation and unknown text without inventing a match", async () => {
    expect(
      (await interpreter.interpret("海边但不是治愈系")).mappedTagIds,
    ).not.toContain("想被安慰");
    expect((await interpreter.interpret("qzxv7733")).mappedTagIds).toHaveLength(
      0,
    );
    expect((await interpreter.interpret("   ")).confidence).toBe(0);
  });
});
describe("biased discovery", () => {
  it("is seedable, avoids recent draws, has exploration", () => {
    const clues = [selectionFor("科幻")];
    expect(recommend(clues, [], seededRandom(42))).toEqual(
      recommend(clues, [], seededRandom(42)),
    );
    const random = seededRandom(104),
      recent: string[] = [];
    let exploration = 0,
      matched = 0;
    for (let i = 0; i < 500; i++) {
      const r = recommend(clues, recent, random);
      expect(recent.slice(0, 8)).not.toContain(r.book.id);
      recent.unshift(r.book.id);
      const independent = recommend(clues, [], random);
      if (independent.exploration) exploration++;
      if (independent.matched.length) matched++;
    }
    expect(exploration).toBeGreaterThan(110);
    expect(exploration).toBeLessThan(185);
    expect(matched).toBeGreaterThan(300);
  });
  it("works without clues and recovers when recent list fills the pool", () => {
    expect(recommend([], [], seededRandom(3)).book).toBeDefined();
    expect(
      recommend(
        [],
        books.map((b) => b.id),
        seededRandom(1),
        books.slice(0, 3),
      ).book.id,
    ).not.toBe(books[0].id);
    expect(() => recommend([], [], Math.random, [])).toThrow();
  });
});
describe("legal availability", () => {
  it("retains search links when every provider fails", async () => {
    const r = await getAvailability({ ...books[0], id: "offline-test" }, [
      {
        id: "offline",
        lookup: async () => {
          throw new Error("offline");
        },
      },
    ]);
    expect(r.status).toBe("unavailable");
    expect(r.links).toHaveLength(5);
    expect(r.links.every((l) => l.type === "search" && !l.verified)).toBe(true);
  });
  it("only accepts verified book identity and preview rights", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [
              {
                volumeInfo: {
                  title: books[0].title,
                  authors: [books[0].author],
                  previewLink: "https://books.google.com/books?id=test",
                },
                accessInfo: { viewability: "PARTIAL", country: "US" },
              },
            ],
          }),
        }),
    );
    const links = await new GoogleBooksProvider().lookup(books[0]);
    expect(links[0].type).toBe("preview");
    expect(links[0].region).toBe("US");
    expect(links[0].checkedAt).toBeDefined();
  });
  it("rejects mismatched titles and restricted previews", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [
              {
                volumeInfo: {
                  title: "错误的书",
                  authors: [books[0].author],
                  previewLink: "https://books.google.com/books?id=test",
                },
                accessInfo: { viewability: "ALL_PAGES" },
              },
            ],
          }),
        }),
    );
    expect(await new GoogleBooksProvider().lookup(books[0])).toEqual([]);
  });
  it("interprets Open Library borrow status without claiming free access", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            docs: [
              {
                key: "/works/OL1W",
                title: books[0].title,
                author_name: [books[0].author],
                ebook_access: "borrowable",
              },
            ],
          }),
        }),
    );
    expect((await new OpenLibraryProvider().lookup(books[0]))[0].type).toBe(
      "borrow",
    );
  });
});
