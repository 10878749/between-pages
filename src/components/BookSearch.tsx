import { useEffect, useRef, useState } from "react";
import { Search, ArrowUpRight, Check, Plus } from "lucide-react";
import type { Book } from "../data/types";
import {
  type CatalogBook,
  type CatalogResult,
  searchCatalog,
  enrichCatalogBook,
  bookIdentity,
} from "../lib/providers/catalog";
import { Sheet } from "./Sheet";
export function BookSearch({
  catalog,
  onAdd,
  onView,
  onClose,
}: {
  catalog: Book[];
  onAdd: (books: CatalogBook[]) => void;
  onView: (book: Book) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState<CatalogResult | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null),
    detail = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      detail.current?.abort();
    },
    [],
  );
  const local = submitted
    ? catalog.filter((b) =>
        (b.title + " " + b.author + " " + (b.originalTitle ?? ""))
          .toLowerCase()
          .includes(submitted.toLowerCase()),
      )
    : [];
  const ids = new Set(catalog.map(bookIdentity));
  const remaining = Math.max(0, 500 - catalog.filter((b) => b.source).length);
  async function search(text: string, next = 1) {
    text = text.trim();
    if (!text) {
      setNotice("写下书名、作者或主题，再开始搜索。");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSubmitted(text);
    setQuery(text);
    setPage(next);
    setResult(null);
    setLoading(true);
    setNotice("");
    try {
      const data = await searchCatalog(text, next, controller.signal);
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted)
        setNotice("暂时连不上外部书库，请稍后重试。");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function view(b: Book) {
    if (b.source && !ids.has(bookIdentity(b)) && remaining === 0) {
      setNotice("已保留 500 本外部书目，本次可以通过来源页面查看。");
      return;
    }
    if (!b.source) {
      onView(b);
      return;
    }
    detail.current?.abort();
    const controller = new AbortController();
    detail.current = controller;
    setBusy(b.id);
    const enriched = await enrichCatalogBook(
      b as CatalogBook,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    onAdd([enriched]);
    onView(enriched);
    setBusy("");
  }
  return (
    <Sheet title="去更大的书海里找找" onClose={onClose}>
      <p className="sheet-subtitle">
        搜索书名、作者或主题。喜欢的书可以带回来，加入下一次盲盒。
      </p>
      <form
        className="catalog-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <label className="search-line">
          <Search size={18} />
          <input
            name="book-query"
            aria-label="搜索书名、作者或主题"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="比如「刘慈欣」「海洋」或 ISBN…"
            autoComplete="off"
            maxLength={150}
          />
        </label>
        <button className="primary" type="submit">
          搜索
        </button>
      </form>
      {!submitted && (
        <div className="search-suggestions">
          <span>也可以从这里开始</span>
          {["中国文学", "科幻", "女性写作", "哲学", "自然", "短篇小说"].map(
            (q) => (
              <button key={q} onClick={() => void search(q)}>
                {q} ↗
              </button>
            ),
          )}
        </div>
      )}
      <p className="catalog-status" role="status">
        {loading
          ? "正在翻找 Open Library 与 Google Books…"
          : notice ||
            (result
              ? result.failed.length
                ? `${result.failed.join("、")} 暂未响应。已展示其他可用结果，可以重试。`
                : `找到 ${result.books.length} 条外部书目，本页结果如下。`
              : `本地可抽 ${catalog.length} 本，外部书库按需搜索。`)}
      </p>
      {local.length > 0 && page === 1 && (
        <section className="catalog-results">
          <h3>已经在页间 · {local.length}</h3>
          {local.slice(0, 12).map((b) => (
            <div className="catalog-row" key={b.id}>
              <div>
                <h4>{b.title}</h4>
                <p>{b.author}</p>
              </div>
              <button onClick={() => void view(b)}>查看详情 ↗</button>
            </div>
          ))}
        </section>
      )}
      {result && (
        <section className="catalog-results">
          <div className="catalog-results-heading">
            <h3>外部书架 · 第 {page} 页</h3>
            {remaining > 0 &&
              result.books.some((b) => !ids.has(bookIdentity(b))) && (
                <button
                  onClick={() => {
                    onAdd(result.books);
                    setNotice(
                      "本页书目已加入盲盒，之后抽书也可能遇见它们（最多保留 500 本）。",
                    );
                  }}
                >
                  本页全部加入 <Plus size={14} />
                </button>
              )}
          </div>
          {result.books.map((b) => {
            const added = ids.has(bookIdentity(b));
            return (
              <article className="catalog-row external-row" key={b.id}>
                <div>
                  <small>
                    {b.source.provider}
                    {b.year ? ` · 初版 ${b.year}` : ""}
                  </small>
                  <h4>{b.title}</h4>
                  <p>{b.author}</p>
                  <p className="catalog-excerpt">{b.bookSummary}</p>
                  <div className="catalog-row-actions">
                    <button disabled={!!busy} onClick={() => void view(b)}>
                      {busy === b.id
                        ? "正在翻开…"
                        : added
                          ? "查看详情"
                          : "加入并查看"}
                    </button>
                    <a
                      href={b.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      来源页面 <ArrowUpRight size={13} />
                    </a>
                    <button
                      disabled={added || remaining === 0}
                      onClick={() => {
                        onAdd([b]);
                        setNotice(`《${b.title}》已加入盲盒。`);
                      }}
                    >
                      {added ? <Check size={14} /> : <Plus size={14} />}{" "}
                      {added
                        ? "已在盲盒"
                        : remaining === 0
                          ? "书库已满"
                          : "加入盲盒"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!result.books.length && (
            <p className="empty">
              这次没有找到外部书目。试试作者名、原文书名，或去下面的平台搜索。
            </p>
          )}
          <div className="catalog-pagination">
            <button
              disabled={page === 1 || loading}
              onClick={() => void search(submitted, page - 1)}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              disabled={!result.hasMore || loading}
              onClick={() => void search(submitted, page + 1)}
            >
              下一页
            </button>
          </div>
        </section>
      )}
      {submitted && (
        <div className="catalog-fallback">
          <p>也去中文平台找找</p>
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(submitted)}`}
          >
            在微信读书搜索 ↗
          </a>
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(submitted)}`}
          >
            在豆瓣搜索 ↗
          </a>
          <button
            onClick={() => void search(submitted, page)}
            disabled={loading}
          >
            重新查询
          </button>
        </div>
      )}
      <p className="local-note">
        外部书目覆盖与语言因来源而异；搜索命中不代表可免费阅读。最多可在此浏览器保留
        500 本外部书目。
      </p>
    </Sheet>
  );
}
