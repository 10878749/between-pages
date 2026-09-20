import { useReducer, useRef, useEffect } from "react";
import { BookOpen, Bookmark, History, ArrowLeft } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { BoxState, Selection, Draw } from "./data/types";
import { books, bookById } from "./data/books";
import { TagPicker } from "./components/TagPicker";
import { BlindBox } from "./components/BlindBox";
import { BookReveal } from "./components/BookReveal";
import { BookCover } from "./components/BookCover";
import { Sheet } from "./components/Sheet";
import { recommend } from "./lib/recommendation/recommendation";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useState } from "react";
import { useReadingTools } from "./hooks/useReadingTools";
const validHistory = (x: unknown): x is Draw[] =>
  Array.isArray(x) &&
  x.length <= 20 &&
  x.every(
    (d) =>
      d &&
      typeof d.bookId === "string" &&
      bookById.has(d.bookId) &&
      typeof d.time === "number" &&
      typeof d.exploration === "boolean" &&
      Array.isArray(d.matched) &&
      d.matched.every((t: unknown) => typeof t === "string") &&
      Array.isArray(d.selections) &&
      d.selections.every(
        (s: Selection) =>
          s &&
          typeof s.id === "string" &&
          typeof s.label === "string" &&
          Array.isArray(s.tagIds) &&
          s.tagIds.every((t) => typeof t === "string"),
      ),
  );
const validFavorites = (x: unknown): x is string[] =>
  Array.isArray(x) &&
  x.every((id) => typeof id === "string" && bookById.has(id));
function reducer(state: BoxState, next: BoxState): BoxState {
  const allowed: Record<BoxState, BoxState[]> = {
    idle: ["selecting", "ready", "dragging", "opening", "revealed"],
    selecting: ["ready", "selecting", "opening", "dragging", "revealed"],
    ready: ["selecting", "dragging", "opening", "revealed"],
    dragging: ["ready", "opening"],
    opening: ["revealed", "ready"],
    revealed: ["closing", "revealed"],
    closing: ["ready"],
  };
  return allowed[state].includes(next) ? next : state;
}
export default function App() {
  const [state, dispatch] = useReducer(reducer, "idle");
  const [selected, setSelected] = useState<Selection[]>([]),
    [draw, setDraw] = useState<Draw | null>(null),
    [panel, setPanel] = useState<"history" | "shelf" | null>(null),
    [error, setError] = useState(""),
    [removedFavorite, setRemovedFavorite] = useState<string | null>(null);
  const [history, setHistory, historyUnavailable] = useLocalStorage(
    "between-pages:history:v1",
    [],
    validHistory,
  );
  const [favorites, setFavorites, favoritesUnavailable] = useLocalStorage(
    "between-pages:favorites:v1",
    [],
    validFavorites,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    locked = useRef(false);
  const reduce = useReducedMotion();
  const book = draw ? bookById.get(draw.bookId) : undefined;
  useReadingTools(state, selected, book);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function choose(next: Selection[]) {
    if (locked.current) return;
    setSelected(next);
    dispatch(next.length ? "selecting" : "ready");
  }
  function open(surprise = false) {
    if (locked.current || state === "revealed" || state === "closing") return;
    locked.current = true;
    setError("");
    try {
      const clues = surprise ? [] : selected;
      if (surprise) setSelected([]);
      const result = recommend(
        clues,
        history.map((d) => d.bookId),
      );
      const next: Draw = {
        bookId: result.book.id,
        time: Date.now(),
        selections: clues,
        matched: result.matched,
        exploration: result.exploration,
      };
      setDraw(next);
      dispatch("opening");
      timer.current = setTimeout(
        () => {
          setHistory((h) => [next, ...h].slice(0, 20));
          dispatch("revealed");
          locked.current = false;
          window.scrollTo({ top: 0, behavior: "instant" });
        },
        reduce ? 80 : 1200,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "这一盒暂时没有打开，请再试一次。",
      );
      locked.current = false;
      dispatch("ready");
    }
  }
  function again() {
    if (locked.current) return;
    locked.current = true;
    dispatch("closing");
    timer.current = setTimeout(
      () => {
        setDraw(null);
        dispatch("ready");
        locked.current = false;
        window.scrollTo({ top: 0, behavior: "instant" });
      },
      reduce ? 0 : 350,
    );
  }
  function restore(item: Draw) {
    if (locked.current) return;
    setDraw(item);
    setSelected(item.selections);
    dispatch("revealed");
    setPanel(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function save() {
    if (book)
      setFavorites((f) =>
        f.includes(book.id)
          ? f.filter((id) => id !== book.id)
          : [book.id, ...f],
      );
  }
  const shown = state === "revealed" || state === "closing";
  return (
    <>
      <a className="skip-link" href="#main">
        跳到阅读盲盒
      </a>
      <header>
        <a
          className="brand"
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            if (shown) again();
            else document.getElementById("main")?.focus();
          }}
          aria-label="页间，回到拆盒"
        >
          <BookOpen size={26} />
          <strong>页间</strong>
          <span>BETWEEN PAGES</span>
        </a>
        <nav aria-label="阅读记录">
          <button
            disabled={state === "opening" || state === "closing"}
            onClick={() => setPanel("history")}
            aria-label="今晚开过的书"
          >
            <History size={16} />
            <span>今晚开过的书</span>
          </button>
          <button
            disabled={state === "opening" || state === "closing"}
            onClick={() => setPanel("shelf")}
            aria-label="我的小书架"
          >
            <Bookmark size={16} />
            <span>我的小书架</span>
            {favorites.length > 0 && <b>{favorites.length}</b>}
          </button>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {(historyUnavailable || favoritesUnavailable) && (
          <p className="storage-note" role="status">
            浏览器暂时无法保存记录。本次仍可使用书架和历史，关闭页面后可能丢失。
          </p>
        )}
        <AnimatePresence mode="wait">
          {shown && book && draw ? (
            <motion.div
              key="result"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{
                opacity: state === "closing" ? 0 : 1,
                y: 0,
                scale: state === "closing" && !reduce ? 0.96 : 1,
                x: state === "closing" && !reduce ? -35 : 0,
              }}
              transition={{ duration: reduce ? 0 : 0.35 }}
            >
              <button className="back-button" onClick={again}>
                <ArrowLeft size={16} />
                再留一些线索
              </button>
              <BookReveal
                book={book}
                draw={draw}
                saved={favorites.includes(book.id)}
                onSave={save}
                onAgain={again}
              />
            </motion.div>
          ) : (
            <motion.div
              key="box"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
            >
              <div className="intro">
                <span className="eyebrow">给偶然，留一页空白</span>
                <h1>
                  今晚，想遇见
                  <br />
                  一本什么样的书<span className="question">？</span>
                </h1>
                <p>留下一点线索，把剩下的交给偶然。</p>
              </div>
              <div className="workspace">
                <div
                  className={state === "opening" ? "picker-disabled" : ""}
                  inert={state === "opening"}
                >
                  <TagPicker
                    selected={selected}
                    onChange={choose}
                    onSurprise={() => open(true)}
                  />
                </div>
                <BlindBox
                  selected={selected}
                  state={state}
                  book={book}
                  onRemove={(id) => choose(selected.filter((s) => s.id !== id))}
                  onOpen={() => open()}
                  onDragState={(dragging) =>
                    dispatch(dragging ? "dragging" : "ready")
                  }
                  onSurprise={() => open(true)}
                />
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="bottom-note">
                <span>不必读完每一本。遇见，也是一件很好的事。</span>
                <span>一本书 · 一点线索 · 一次偶然</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <footer>
        <span>页间 · BETWEEN PAGES</span>
        <span>愿你在字里行间，遇见自己。</span>
      </footer>
      {panel && (
        <Sheet
          title={panel === "history" ? "今晚开过的书" : "我的小书架"}
          onClose={() => setPanel(null)}
        >
          <p className="sheet-subtitle">
            {panel === "history"
              ? "相遇过的书，最近 20 次都留在这里。"
              : "把想再见的书，放在这个小小的角落。"}
          </p>
          {panel === "history" ? (
            history.length ? (
              <div className="history-list">
                {history.map((item, i) => {
                  const b = bookById.get(item.bookId)!;
                  return (
                    <button
                      key={item.time + "-" + i}
                      onClick={() => restore(item)}
                    >
                      <time>
                        {new Date(item.time).toLocaleDateString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                        })}
                        <br />
                        {new Date(item.time).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      <div>
                        <strong>{b.title}</strong>
                        <span>{b.author}</span>
                      </div>
                      <span aria-hidden="true">↗</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty">
                <BookOpen />
                <p>这里还没有相遇的记录。</p>
                <button className="text-button" onClick={() => setPanel(null)}>
                  去拆第一盒书 →
                </button>
              </div>
            )
          ) : favorites.length ? (
            <div className="shelf-grid">
              {favorites.map((id) => {
                const b = bookById.get(id)!;
                return (
                  <div key={id}>
                    <button
                      className="shelf-book"
                      onClick={() =>
                        restore(
                          history.find((d) => d.bookId === id) ?? {
                            bookId: id,
                            time: Date.now(),
                            selections: [],
                            matched: [],
                            exploration: true,
                          },
                        )
                      }
                    >
                      <BookCover book={b} small />
                      <span>{b.title}</span>
                    </button>
                    <button
                      className="remove-favorite"
                      onClick={() => {
                        setRemovedFavorite(id);
                        setFavorites((f) => f.filter((v) => v !== id));
                      }}
                      aria-label={`从书架移除 ${b.title}`}
                    >
                      从书架移除
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <Bookmark />
              <p>还没有收进来的书。</p>
              <p>遇见喜欢的那一本时，轻轻点一下「收进书架」。</p>
            </div>
          )}
          {panel === "shelf" && removedFavorite && (
            <div className="undo-line" role="status">
              <span>
                已从书架移除《{bookById.get(removedFavorite)?.title}》
              </span>
              <button
                onClick={() => {
                  setFavorites((f) =>
                    f.includes(removedFavorite) ? f : [removedFavorite, ...f],
                  );
                  setRemovedFavorite(null);
                }}
              >
                撤销
              </button>
            </div>
          )}
          <p className="local-note">
            记录仅保存在此浏览器。书库里有 {books.length} 种相遇。
          </p>
        </Sheet>
      )}
    </>
  );
}
