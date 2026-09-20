import type { Book, BookAvailability } from "../../data/types";
import { type BookProvider, identityMatches, safeUrl } from "./providerSearch";
interface Volume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    industryIdentifiers?: { identifier: string }[];
    previewLink?: string;
  };
  accessInfo?: {
    viewability?: string;
    webReaderLink?: string;
    country?: string;
  };
  saleInfo?: { saleability?: string; buyLink?: string; country?: string };
}
export class GoogleBooksProvider implements BookProvider {
  id = "google-books";
  async lookup(book: Book) {
    const q = book.isbn13
      ? `isbn:${book.isbn13}`
      : `intitle:${book.title} inauthor:${book.author}`;
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) throw new Error("Google Books unavailable");
    const data = (await response.json()) as { items?: Volume[] };
    if (!Array.isArray(data.items)) return [];
    const links: BookAvailability[] = [];
    for (const v of data.items) {
      const info = v.volumeInfo;
      if (!info) continue;
      const exactIsbn =
        !!book.isbn13 &&
        info.industryIdentifiers?.some((i) => i.identifier === book.isbn13);
      if (
        !exactIsbn &&
        !identityMatches(book, info.title ?? "", info.authors ?? [])
      )
        continue;
      const access = v.accessInfo;
      const preview = safeUrl(info.previewLink, ["books.google.com"]);
      if (
        preview &&
        ["PARTIAL", "ALL_PAGES"].includes(access?.viewability ?? "")
      )
        links.push({
          provider: "Google Books",
          type: "preview",
          url: preview,
          label: "Google Books 试读",
          verified: true,
          region: access?.country,
          checkedAt: new Date().toISOString(),
        });
      const reader = safeUrl(access?.webReaderLink, [
        "play.google.com",
        "books.google.com",
      ]);
      if (reader && access?.viewability === "ALL_PAGES")
        links.push({
          provider: "Google Books",
          type: "read",
          url: reader,
          label: "Google Books 阅读",
          verified: true,
          region: access.country,
          checkedAt: new Date().toISOString(),
        });
      const buy = safeUrl(v.saleInfo?.buyLink, [
        "play.google.com",
        "books.google.com",
      ]);
      if (buy && v.saleInfo?.saleability === "FOR_SALE")
        links.push({
          provider: "Google Books",
          type: "ebook",
          url: buy,
          label: "Google Books 电子书",
          verified: true,
          region: v.saleInfo.country,
          checkedAt: new Date().toISOString(),
        });
      if (links.length) break;
    }
    return links;
  }
}
