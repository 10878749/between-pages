import { books } from "../../data/books";
import type { Book, Selection } from "../../data/types";
import { scoreBook, matchStrength } from "./scoring";
import { weightedPick } from "./random";
export function recommend(
  selections: Selection[],
  recent: string[],
  random: () => number = Math.random,
  catalog: Book[] = books,
) {
  const valid = catalog.filter(
    (b) => b.id && b.title && b.author && b.bookSummary && b.tags.length,
  );
  if (!valid.length) throw new Error("书架暂时空了，请稍后再来。");
  let pool = valid.filter((b) => !recent.slice(0, 8).includes(b.id));
  if (!pool.length) pool = valid.filter((b) => b.id !== recent[0]);
  if (!pool.length) pool = valid;
  const rated = pool
    .map((book) => ({ book, score: scoreBook(book, selections) }))
    .sort((a, b) => b.score - a.score);
  const exploration =
    selections.length === 0 || rated[0].score === 0 || random() < 0.3;
  const candidates = exploration
    ? rated
    : rated
        .filter((x) => x.score > 0)
        .slice(0, Math.max(5, Math.ceil(rated.length * 0.3)));
  const book = weightedPick(
    candidates.map(({ book, score }) => ({
      value: book,
      weight: exploration ? 1 : 1 + score + random() * 2,
    })),
    random,
  );
  const matched = selections
    .filter((s) => s.tagIds.some((id) => matchStrength(book, id) > 0))
    .map((s) => s.label);
  return { book, matched, exploration };
}
