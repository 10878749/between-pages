import { useEffect, useRef } from "react";
import { Bookmark, Check, ArrowUpRight, ArrowDown } from "lucide-react";
import type { Book, Draw } from "../data/types";
import { authors } from "../data/authors";
import { BookCover } from "./BookCover";
import { AvailabilitySection } from "./AvailabilitySection";
export function BookReveal({
  book,
  draw,
  saved,
  onSave,
  onAgain,
}: {
  book: Book;
  draw: Draw;
  saved: boolean;
  onSave: () => void;
  onAgain: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [book.id]);
  const author = authors[book.authorId];
  const attributes = [
    ["安静程度", book.dimensions.quietness],
    ["梦境感", book.dimensions.dreaminess],
    ["内省浓度", book.dimensions.introspection],
    ["容易进入", book.dimensions.accessibility],
    ["读完想发呆", book.dimensions.aftertaste],
  ] as const;
  return (
    <article className="result">
      <div className="result-heading">
        <span className="eyebrow">原来，是这一本</span>
        <span className="encounter-date">
          {new Date(draw.time).toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
          })}{" "}
          的相遇
        </span>
      </div>
      <div className="result-hero">
        <div className="result-cover">
          <BookCover book={book} />
          <small>页间排印封面 · 非出版实物书封</small>
        </div>
        <div className="result-copy">
          <span className="book-genre">{book.tags[0]}</span>
          <h1 ref={title} tabIndex={-1}>
            {book.title}
          </h1>
          <p className="author-name">
            {book.author}
            {author.originalName && <span>{author.originalName}</span>}
          </p>
          <p className="teaser">{book.teaser}</p>
          <div className="why">
            <h2>为什么今晚是它</h2>
            {draw.exploration && draw.selections.length > 0 ? (
              <>
                <span className="unexpected">一点意外</span>
                <p>
                  这一盒稍微偏离了你的纸签。
                  <br />
                  {book.whyNow}
                </p>
              </>
            ) : (
              <p>
                {draw.matched.length
                  ? `你留下了「${draw.matched.slice(0, 3).join("」和「")}」。这些线索把我们带到了这里。`
                  : "没有留下线索，也可以有一场好相遇。"}
                <br />
                {book.whyNow}
              </p>
            )}
            {draw.matched.length > 0 && (
              <>
                <small>你们刚好在这些地方碰到了</small>
                <div className="matched-tags">
                  {draw.matched.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="result-actions">
            <button
              className={"save-button " + (saved ? "is-saved" : "")}
              onClick={onSave}
            >
              {saved ? <Check size={17} /> : <Bookmark size={17} />}{" "}
              {saved ? "已收进书架" : "收进书架"}
            </button>
            <a href="#about-book" className="detail-link">
              翻开这一页 <ArrowDown size={15} />
            </a>
          </div>
        </div>
      </div>
      <div className="reading-details" id="about-book">
        <section>
          <span className="detail-number">01</span>
          <h2>关于这本书</h2>
          <p>{book.bookSummary}</p>
          <div className="metadata">
            {[
              book.tags[0],
              book.year,
              book.pageCount ? `约 ${book.pageCount} 页` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </section>
        <section>
          <span className="detail-number">02</span>
          <h2>关于作者</h2>
          <p className="author-caption">
            {author.name}
            {author.originalName && ` / ${author.originalName}`}
          </p>
          <p>{author.shortBio}</p>
        </section>
        <section>
          <span className="detail-number">03</span>
          <h2>这本书的性格</h2>
          <div className="attributes">
            {attributes.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <span
                  role="img"
                  aria-label={`${value}，满格五格`}
                  className="attribute-dots"
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < value ? "filled" : ""} />
                  ))}
                </span>
              </div>
            ))}
          </div>
          <small className="muted">页间的主观阅读感受，供你参考。</small>
          <p className="reading-note">阅读边注 / {book.readingNote}</p>
        </section>
        <AvailabilitySection key={book.id} book={book} />
        <div className="end-actions">
          <button className="save-button" onClick={onSave}>
            {saved ? <Check size={17} /> : <Bookmark size={17} />}{" "}
            {saved ? "已收进书架" : "收进书架"}
          </button>
          <button className="primary" onClick={onAgain}>
            再开一盒 <ArrowUpRight size={16} />
          </button>
        </div>
        <p className="ending">每一次翻页，都是另一种可能。</p>
      </div>
    </article>
  );
}
