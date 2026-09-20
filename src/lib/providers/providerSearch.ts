import { authors as authorData } from "../../data/authors";
import type { Book, BookAvailability } from "../../data/types";
export interface BookProvider {
  id: string;
  lookup(book: Book): Promise<BookAvailability[]>;
}
export function providerSearch(book: Book): BookAvailability[] {
  const q = encodeURIComponent(`${book.title} ${book.author}`);
  return [
    {
      provider: "微信读书",
      type: "search",
      label: "在微信读书搜索",
      url: `https://weread.qq.com/web/search/books?keyword=${q}`,
    },
    {
      provider: "当当",
      type: "search",
      label: "去当当找找",
      url: `https://search.dangdang.com/?key=${q}`,
    },
    {
      provider: "京东",
      type: "search",
      label: "在京东搜索",
      url: `https://search.jd.com/Search?keyword=${q}&enc=utf-8`,
    },
    {
      provider: "Open Library",
      type: "search",
      label: "在 Open Library 搜索",
      url: `https://openlibrary.org/search?q=${q}`,
    },
    {
      provider: "Google Books",
      type: "search",
      label: "在 Google Books 搜索",
      url: `https://books.google.com/books?q=${q}`,
    },
  ];
}
export function safeUrl(url: unknown, hosts: string[]) {
  try {
    const u = new URL(String(url));
    return ["https:", "http:"].includes(u.protocol) &&
      hosts.includes(u.hostname)
      ? u.href.replace(/^http:/, "https:")
      : null;
  } catch {
    return null;
  }
}
export function identityMatches(book: Book, title: string, authors: string[]) {
  const norm = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\p{P}\p{Z}\s]/gu, "");
  const titles = [book.title, book.originalTitle].filter(
    (s): s is string => !!s,
  );
  return (
    titles.some((t) => norm(t) === norm(title)) &&
    authors.some((a) =>
      [book.author, authorData[book.authorId]?.originalName].some(
        (name) => name && norm(a) === norm(name),
      ),
    )
  );
}
