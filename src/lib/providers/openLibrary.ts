import { authors } from "../../data/authors";
import type { Book, BookAvailability } from "../../data/types";
import { type BookProvider, identityMatches } from "./providerSearch";
interface Work {
  key?: string;
  title?: string;
  author_name?: string[];
  ebook_access?: string;
  isbn?: string[];
}
export class OpenLibraryProvider implements BookProvider {
  id = "open-library";
  async lookup(book: Book) {
    const query = book.isbn13
      ? `isbn=${encodeURIComponent(book.isbn13)}`
      : `title=${encodeURIComponent(book.originalTitle ?? book.title)}&author=${encodeURIComponent(authors[book.authorId]?.originalName || book.author)}`;
    const response = await fetch(
      `https://openlibrary.org/search.json?${query}&fields=key,title,author_name,ebook_access,isbn&limit=5`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) throw new Error("Open Library unavailable");
    const data = (await response.json()) as { docs?: Work[] };
    if (!Array.isArray(data.docs)) return [];
    const bookWork = data.docs.find(
      (w) =>
        ((book.isbn13 && w.isbn?.includes(book.isbn13)) ||
          identityMatches(book, w.title ?? "", w.author_name ?? [])) &&
        /^\/works\/OL\d+W$/.test(w.key ?? ""),
    );
    if (
      !bookWork ||
      !["public", "borrowable", "printdisabled"].includes(
        bookWork.ebook_access ?? "",
      )
    )
      return [];
    if (bookWork.ebook_access === "printdisabled") return [];
    return [
      {
        provider: "Open Library",
        type: bookWork.ebook_access === "public" ? "read" : "borrow",
        url: `https://openlibrary.org${bookWork.key}`,
        label:
          bookWork.ebook_access === "public"
            ? "Open Library 阅读"
            : "Open Library 借阅（需账号）",
        verified: true,
        region: "以平台所在地权限为准",
        checkedAt: new Date().toISOString(),
      },
    ] satisfies BookAvailability[];
  }
}
