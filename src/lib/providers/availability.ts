import type { Book, BookAvailability } from "../../data/types";
import { GoogleBooksProvider } from "./googleBooks";
import { OpenLibraryProvider } from "./openLibrary";
import { type BookProvider, providerSearch, safeUrl } from "./providerSearch";
export type AvailabilityResult = {
  links: BookAvailability[];
  status: "found" | "empty" | "unavailable";
};
const cache = new Map<
  string,
  { expires: number; value: Promise<AvailabilityResult> }
>();
export function getAvailability(
  book: Book,
  providers: BookProvider[] = [
    new GoogleBooksProvider(),
    new OpenLibraryProvider(),
  ],
): Promise<AvailabilityResult> {
  const cached = cache.get(book.id);
  if (cached && cached.expires > Date.now()) return cached.value;
  const task = (async () => {
    const direct = (book.availability ?? []).filter(
      (l) =>
        l.verified &&
        safeUrl(l.url, [
          "books.google.com",
          "play.google.com",
          "openlibrary.org",
          "www.gutenberg.org",
          "weread.qq.com",
        ]) &&
        !!l.checkedAt &&
        Date.now() - Date.parse(l.checkedAt) < 86400000,
    );
    if (direct.length)
      return {
        links: [...direct, ...providerSearch(book)],
        status: "found",
      } as AvailabilityResult;
    const results = await Promise.allSettled(
      providers.map((p) => p.lookup(book)),
    );
    const found = results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    return {
      links: [...found, ...providerSearch(book)],
      status: found.length
        ? "found"
        : results.every((r) => r.status === "rejected")
          ? "unavailable"
          : "empty",
    } as AvailabilityResult;
  })();
  cache.set(book.id, { expires: Date.now() + 15 * 60 * 1000, value: task });
  return task;
}
