import type { Book } from "../../data/types";
import { tags } from "../../data/tags";
export type CatalogBook = Book & {
  source: {
    provider: "Open Library" | "Google Books";
    url: string;
    fetchedAt: string;
  };
};
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
export function plainText(v: unknown) {
  return str(v)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot);/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}
function base(
  id: string,
  title: string,
  author: string,
  subjects: string[],
  provider: CatalogBook["source"]["provider"],
  url: string,
): CatalogBook {
  const keywords = subjects.join(" ").toLowerCase();
  const matched = tags
    .filter(
      (t) =>
        t.category !== "personality" &&
        keywords.includes(t.label.toLowerCase()),
    )
    .map((t) => t.id);
  for (const [key, value] of [
    ["fiction", "小说"],
    ["poetry", "诗歌"],
    ["essays", "散文"],
    ["mystery", "推理"],
    ["science fiction", "科幻"],
    ["fantasy", "奇幻"],
    ["history", "历史"],
    ["philosophy", "哲学"],
    ["biography", "传记"],
    ["nature", "自然"],
    ["short stories", "短篇"],
  ])
    if (keywords.includes(key)) matched.push(value);
  return {
    id,
    title: title.slice(0, 200),
    authorId: id + "-author",
    author: author || "作者信息待补充",
    tags: [...new Set(matched.length ? matched : ["外部书库"])],
    semanticTags: subjects.slice(0, 30),
    teaser: "从更远的书架，来到页间。",
    bookSummary: "外部书库暂未提供简介。可以打开来源页面了解这本书。",
    whyNow: "这是你从外部书库带回的一本书。让它与今晚的线索，重新相遇。",
    readingNote: "外部书目尚未经页间人工编选，请以具体版本与来源页面为准。",
    dimensions: {
      introspection: 0,
      dreaminess: 0,
      quietness: 0,
      accessibility: 0,
      aftertaste: 0,
    },
    palette: { paper: "#dbe3d0", ink: "#344e40", accent: "#9d7758" },
    source: { provider, url, fetchedAt: new Date().toISOString() },
  };
}
export function parseOpenLibrary(data: unknown): CatalogBook[] {
  const rows = obj(data).docs;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const r = obj(raw),
      key = str(r.key),
      title = str(r.title);
    if (!/^\/works\/OL\d+W$/.test(key) || !title) return [];
    const b = base(
      "ol-" + key.split("/").pop(),
      title,
      strings(r.author_name).join("、"),
      strings(r.subject),
      "Open Library",
      "https://openlibrary.org" + key,
    );
    if (typeof r.first_publish_year === "number") b.year = r.first_publish_year;
    if (typeof r.edition_count === "number") b.editionCount = r.edition_count;
    return [b];
  });
}
export function parseGoogleBooks(data: unknown): CatalogBook[] {
  const rows = obj(data).items;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const r = obj(raw),
      v = obj(r.volumeInfo),
      id = str(r.id),
      title = str(v.title);
    if (!/^[\w-]+$/.test(id) || !title) return [];
    const b = base(
      "gb-" + id,
      title,
      strings(v.authors).join("、"),
      strings(v.categories),
      "Google Books",
      `https://books.google.com/books?id=${encodeURIComponent(id)}`,
    );
    b.bookSummary = plainText(v.description) || b.bookSummary;
    const ids = Array.isArray(v.industryIdentifiers)
      ? v.industryIdentifiers.map(obj)
      : [];
    const isbn = ids.find(
      (i) => i.type === "ISBN_13" && /^\d{13}$/.test(str(i.identifier)),
    );
    if (isbn) b.isbn13 = str(isbn.identifier);
    if (typeof v.pageCount === "number" && v.pageCount > 0)
      b.pageCount = v.pageCount;
    b.publisher = str(v.publisher) || undefined;
    return [b];
  });
}
export function bookIdentity(b: Book) {
  return `${b.title}|${b.author}`
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
}
export function mergeBooks(items: Book[]) {
  const seen = new Set<string>();
  return items.filter((b) => {
    const key = bookIdentity(b);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export type CatalogResult = {
  books: CatalogBook[];
  failed: string[];
  hasMore: boolean;
};
const cache = new Map<string, CatalogResult>();
export async function searchCatalog(
  query: string,
  page: number,
  signal: AbortSignal,
): Promise<CatalogResult> {
  const key = query.trim().toLowerCase() + ":" + page;
  if (cache.has(key)) return cache.get(key)!;
  const q = encodeURIComponent(query.trim());
  const sources = [
    {
      name: "Open Library",
      url: `https://openlibrary.org/search.json?q=${q}&page=${page}&limit=12&fields=key,title,author_name,first_publish_year,subject&lang=zh`,
      parse: parseOpenLibrary,
    },
    {
      name: "Google Books",
      url: `https://www.googleapis.com/books/v1/volumes?q=${q}&startIndex=${(page - 1) * 12}&maxResults=12&printType=books`,
      parse: parseGoogleBooks,
    },
  ];
  const results = await Promise.allSettled(
    sources.map(async (s) => {
      const r = await fetch(s.url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
      });
      if (!r.ok) throw new Error(s.name);
      return s.parse(await r.json());
    }),
  );
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const books = mergeBooks(
    results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
  ) as CatalogBook[];
  const result = {
    books,
    failed: sources
      .filter((_, i) => results[i].status === "rejected")
      .map((s) => s.name),
    hasMore: results.some(
      (r) => r.status === "fulfilled" && r.value.length === 12,
    ),
  };
  if (!result.failed.length) {
    if (cache.size > 30) cache.clear();
    cache.set(key, result);
  }
  return result;
}
export async function enrichCatalogBook(
  book: CatalogBook,
  signal: AbortSignal,
): Promise<CatalogBook> {
  if (book.source.provider !== "Open Library") return book;
  try {
    const url = new URL(book.source.url);
    if (
      url.origin !== "https://openlibrary.org" ||
      !/^\/works\/OL\d+W$/.test(url.pathname)
    )
      return book;
    const r = await fetch(book.source.url + ".json", {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!r.ok) return book;
    const data = obj(await r.json());
    return {
      ...book,
      bookSummary:
        plainText(
          typeof data.description === "string"
            ? data.description
            : obj(data.description).value,
        ) || book.bookSummary,
    };
  } catch {
    return book;
  }
}
export function validCatalog(value: unknown): value is CatalogBook[] {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every((raw) => {
      const b = obj(raw),
        s = obj(b.source),
        p = obj(b.palette);
      return (
        /^(ol-OL\d+W|gb-[\w-]+)$/.test(str(b.id)) &&
        !!str(b.title) &&
        !!str(b.author) &&
        !!str(b.authorId) &&
        !!str(b.bookSummary) &&
        typeof b.whyNow === "string" &&
        typeof b.teaser === "string" &&
        typeof b.readingNote === "string" &&
        Array.isArray(b.tags) &&
        b.tags.every((t) => typeof t === "string") &&
        Array.isArray(b.semanticTags) &&
        b.semanticTags.every((t) => typeof t === "string") &&
        !!b.dimensions &&
        [p.paper, p.ink, p.accent].every((c) =>
          /^#[\da-f]{6}$/i.test(str(c)),
        ) &&
        ((s.provider === "Open Library" &&
          /^https:\/\/openlibrary.org\/works\/OL\d+W$/.test(str(s.url))) ||
          (s.provider === "Google Books" &&
            /^https:\/\/books.google.com\/books\?id=[\w-]+$/.test(str(s.url))))
      );
    })
  );
}
