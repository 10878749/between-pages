import type { CSSProperties } from "react";
import type { Book } from "../data/types";
export function BookCover({
  book,
  small = false,
}: {
  book: Book;
  small?: boolean;
}) {
  return (
    <div
      className={"book-cover " + (small ? "small-cover" : "")}
      style={
        {
          "--cover-paper": book.palette.paper,
          "--cover-ink": book.palette.ink,
          "--cover-accent": book.palette.accent,
        } as CSSProperties
      }
      role="img"
      aria-label={`${book.title}，${book.author}`}
    >
      <div className="cover-title">{book.title}</div>
      <span className="cover-author">{book.author}</span>
      <div className="cover-art" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="cover-bottom" aria-hidden="true">
        页间
      </span>
    </div>
  );
}
