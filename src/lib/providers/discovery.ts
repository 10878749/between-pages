import type { Selection } from "../../data/types";
import {
  parseOpenLibrary,
  parseGoogleBooks,
  mergeBooks,
  type CatalogBook,
} from "./catalog";
import { hasReadingEvidence } from "./quality";
export type RemotePool = {
  books: CatalogBook[];
  cached: boolean;
  broadened: boolean;
};
const topics: Record<string, string> = {
  科幻: "science fiction",
  奇幻: "fantasy",
  梦境: "fantasy",
  想离开现实: "fantasy",
  想看点奇怪的: "fantasy",
  诗歌: "poetry",
  散文: "essays",
  想安静一下: "essays",
  安静: "essays",
  温柔: "fiction",
  想被安慰: "fiction",
  想要一点温柔: "fiction",
  自然: "nature",
  森林: "nature",
  海边: "sea",
  雨夜: "short stories",
  短篇: "short stories",
  想读短一点: "short stories",
  哲学: "philosophy",
  想认真想点东西: "philosophy",
  历史: "history",
  女性: "women",
  旅行: "travel",
  推理: "mystery",
  锋利: "social criticism",
};
const general =
  "(subject:fiction OR subject:poetry OR subject:essays OR subject:history OR subject:philosophy OR subject:nature)";
export function discoveryQuery(clues: Selection[]) {
  const explicit = clues.filter((c) =>
    c.tagIds.some((id) =>
      ["小说", "散文", "诗歌", "科幻", "推理", "奇幻", "历史", "哲学"].includes(
        id,
      ),
    ),
  );
  const subjects = [
    ...new Set(
      (explicit.length ? explicit : clues).flatMap((c) =>
        c.tagIds.map((id) => topics[id]).filter(Boolean),
      ),
    ),
  ].slice(0, 2);
  return subjects.length
    ? `(${subjects.map((s) => `subject:"${s}"`).join(" OR ")}) language:chi`
    : `${general} language:chi`;
}
export function chineseBooks(data: unknown): CatalogBook[] {
  if (!data || typeof data !== "object") return [];
  const docs = (data as { docs?: unknown }).docs;
  if (!Array.isArray(docs)) return [];
  const adapted = docs.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const r = raw as Record<string, unknown>;
    const ed = (
      r.editions as { docs?: Record<string, unknown>[] } | undefined
    )?.docs?.find(
      (e) => Array.isArray(e.language) && e.language.includes("chi"),
    );
    return {
      ...r,
      key:
        typeof r.key === "string" && r.key.startsWith("OL")
          ? "/works/" + r.key
          : r.key,
      title: typeof ed?.title === "string" ? ed.title : r.title,
    };
  });
  return parseOpenLibrary({ docs: adapted })
    .filter((b) => /\p{Script=Han}/u.test(b.title))
    .map((b) => ({
      ...b,
      originalLanguage: "zh",
      teaser: "",
      whyNow: "",
      readingNote: "",
    }));
}
async function fetchPool(
  clues: Selection[],
  signal: AbortSignal,
  request: (url: string, init?: RequestInit) => Promise<Response>,
  page = 1,
) {
  const params = new URLSearchParams({
    q: `${discoveryQuery(clues)} edition_count:[3 TO *]`,
    sort: "editions",
    lang: "zh",
    limit: "100",
    page: String(page),
    fields:
      "key,title,author_name,first_publish_year,subject,edition_count,editions,editions.title,editions.language",
  });
  const response = await request(
    `https://openlibrary.org/search.json?${params}`,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) },
  );
  if (!response.ok) throw new Error("library unavailable");
  return chineseBooks(await response.json());
}
export async function discover(
  clues: Selection[],
  cached: CatalogBook[],
  signal: AbortSignal,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<RemotePool> {
  let books: CatalogBook[] = [];
  let broadened = false;
  try {
    const pages = await Promise.allSettled([
      fetchPool(clues, signal, request),
      fetchPool(clues, signal, request, 2 + Math.floor(Math.random() * 3)),
    ]);
    books = pages.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!books.length && clues.length && !signal.aborted) {
      broadened = true;
      books = await fetchPool([], signal, request);
    }
  } catch {
    /* Second provider or cached remote records can still serve the draw. */
  }
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (!books.length) {
    try {
      const subject =
        clues.flatMap((c) =>
          c.tagIds.map((id) => topics[id]).filter(Boolean),
        )[0] ?? "fiction";
      const params = new URLSearchParams({
        q: `subject:${subject}`,
        langRestrict: "zh",
        maxResults: "40",
        startIndex: "0",
        printType: "books",
      });
      const response = await request(
        `https://www.googleapis.com/books/v1/volumes?${params}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(4500)]) },
      );
      if (response.ok) {
        const data = await response.json();
        const items = Array.isArray(data.items)
          ? data.items.filter(
              (v: { volumeInfo?: { language?: string } }) =>
                v?.volumeInfo?.language === "zh",
            )
          : [];
        books = parseGoogleBooks({ items }).map((b) => ({
          ...b,
          originalLanguage: "zh",
          teaser: "",
          whyNow: "",
          readingNote: "",
        }));
      }
    } catch {
      /* No local curated substitution. */
    }
  }
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (books.length)
    return {
      books: mergeBooks([
        ...cached.filter(hasReadingEvidence),
        ...books,
      ]) as CatalogBook[],
      cached: false,
      broadened,
    };
  const eligible = cached.filter((b) => b.originalLanguage === "zh");
  if (eligible.length)
    return { books: eligible, cached: true, broadened: false };
  throw new Error("暂时连不上书库。请重试。");
}
