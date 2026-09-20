import { useState, useEffect, useRef } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { Bookmark, History, X, BookOpen } from "lucide-react";
import type { Selection, Draw, Book } from "./data/types";
import { books as legacyBooks } from "./data/books";
import { ClueScene } from "./components/ClueScene";
import { ParcelScene } from "./components/ParcelScene";
import { ReadingScene } from "./components/ReadingScene";
import { Sheet } from "./components/Sheet";
import { useLocalStorage } from "./hooks/useLocalStorage";
import {
  validCatalog,
  mergeBooks,
  type CatalogBook,
} from "./lib/providers/catalog";
import { api, session, type Quota, type SavedDraw } from "./lib/api";
import { QuotaNotice } from "./components/QuotaNotice";
import { useReadingTools } from "./hooks/useReadingTools";
type Scene = "clues" | "parcel" | "opening" | "reading";
const validIds = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const validHistory = (v: unknown): v is Draw[] =>
  Array.isArray(v) &&
  v.length <= 20 &&
  v.every(
    (d) =>
      d &&
      typeof d.bookId === "string" &&
      typeof d.time === "number" &&
      Array.isArray(d.selections) &&
      d.selections.every(
        (c: Selection) =>
          c &&
          typeof c.id === "string" &&
          typeof c.label === "string" &&
          Array.isArray(c.tagIds),
      ) &&
      Array.isArray(d.matched),
  );
export default function App() {
  const [scene, setScene] = useState<Scene>("clues"),
    [clues, setClues] = useState<Selection[]>([]),
    [panel, setPanel] = useState<"shelf" | "history" | null>(null),
    [waiting, setWaiting] = useState(false),
    [quota, setQuota] = useState<Quota | null>(null),
    [smartAvailable, setSmartAvailable] = useState(true),
    [quotaError, setQuotaError] = useState(""),
    [drawId, setDrawId] = useState<string | undefined>(),
    [error, setError] = useState(""),
    [current, setCurrent] = useState<Book | null>(null),
    [currentClues, setCurrentClues] = useState<Selection[]>([]),
    [usedCache, setUsedCache] = useState(false),
    [mode, setMode] = useState<"smart" | "light">("smart"),
    [bookMode, setBookMode] = useState<"smart" | "light">("smart"),
    [unlocked, setUnlocked] = useState(false),
    [diagnostic, setDiagnostic] = useState<unknown>(),
    [privateLocked, setPrivateLocked] = useState(false),
    [passcode, setPasscode] = useState(""),
    [phase, setPhase] = useState("正在找书"),
    [prepared, setPrepared] = useState<SavedDraw | null>(null),
    [searchClues, setSearchClues] = useState<Selection[]>([]);
  const [cache, setCache, cacheError] = useLocalStorage<CatalogBook[]>(
      "between-pages:catalog:v1",
      [],
      validCatalog,
    ),
    [favorites, setFavorites, favoriteError] = useLocalStorage(
      "between-pages:favorites:v1",
      [],
      validIds,
    ),
    [history, setHistory, historyError] = useLocalStorage<Draw[]>(
      "between-pages:history:v1",
      [],
      validHistory,
    );
  const locked = useRef(false),
    pendingId = useRef<string | null>(null),
    restored = useRef(false),
    preparationKey = useRef("");
  const reduce = useReducedMotion();
  const catalogue = new Map(
    [...legacyBooks, ...cache, ...(current ? [current] : [])].map((b) => [
      b.id,
      b,
    ]),
  );
  function storeBooks(incoming: CatalogBook[]) {
    setCache(
      (old) => mergeBooks([...incoming, ...old]).slice(0, 500) as CatalogBook[],
    );
  }
  function accept(result: SavedDraw) {
    storeBooks([result.book as CatalogBook]);
    setCurrent(result.book);
    setBookMode(result.mode ?? result.draw.mode ?? "smart");
    setMode(result.mode ?? result.draw.mode ?? "smart");
    setUnlocked(!!result.unlocked);
    setDiagnostic(result.diagnostic);
    setCurrentClues(result.draw.selections);
    setDrawId(result.id);
    setUsedCache(result.cached);
    const draw = { ...result.draw, serverId: result.id };
    setHistory((old) =>
      [draw, ...old.filter((d) => d.serverId !== result.id)].slice(0, 20),
    );
  }
  async function refreshQuota() {
    try {
      const data = await session();
      if (data.locked) {
        setPrivateLocked(true);
        return;
      }
      setPrivateLocked(false);
      setQuota(data.quota);
      setSmartAvailable(
        data.smartAvailable !== false && data.aiConfigured !== false,
      );
      setQuotaError("");
      if (
        (!restored.current && !locked.current) ||
        (!locked.current &&
          pendingId.current &&
          data.latest?.id === pendingId.current)
      ) {
        const recovering =
          !!pendingId.current && data.latest?.id === pendingId.current;
        pendingId.current = null;
        restored.current = true;
        if (data.latest) {
          if (recovering) {
            setPrepared(data.latest);
            setError("");
            setScene("parcel");
          } else {
            accept(data.latest);
            setScene("reading");
          }
        }
      }
    } catch {
      setQuotaError("暂时无法确认次数。");
    }
  }
  useEffect(() => {
    void refreshQuota();
    const interval = setInterval(() => void refreshQuota(), 30000);
    const focus = () => void refreshQuota();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
    // Server clock and cookie are authoritative; refresh never replaces an active scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!quota) return;
    const id = setTimeout(
      () => void refreshQuota(),
      Math.max(1000, quota.resetAt - quota.serverNow + 100),
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quota]);
  useReadingTools(
    scene === "clues"
      ? "selecting"
      : scene === "reading"
        ? "revealed"
        : scene === "opening"
          ? "opening"
          : "ready",
    clues,
    current ?? undefined,
  );
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const poll = async () => {
      if (!pendingId.current) return;
      try {
        const r = await api<{ phase: string }>("progress", {
          id: pendingId.current,
        });
        if (
          alive &&
          ["正在找书", "正在核对书目", "正在比较线索"].includes(r.phase)
        )
          setPhase(r.phase);
      } catch {
        /* Draw response remains authoritative. */
      }
    };
    const id = setInterval(() => void poll(), 1800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [waiting]);
  function next() {
    void prepare();
  }
  async function prepare(selectedMode = mode, force = false) {
    if (locked.current) {
      if (waiting) setScene("parcel");
      return;
    }
    setScene("parcel");
    const signature = JSON.stringify([selectedMode, clues]);
    if (!force && prepared && preparationKey.current === signature) return;
    if (force || preparationKey.current !== signature) pendingId.current = null;
    preparationKey.current = signature;
    setSearchClues(clues);
    setPrepared(null);
    if (
      locked.current ||
      (selectedMode === "smart" && (!quota || quota.remaining === 0))
    )
      return;
    locked.current = true;
    setWaiting(true);
    setPhase("正在找书");
    setError("");
    if (!pendingId.current) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      pendingId.current =
        hex.slice(0, 8) +
        "-" +
        hex.slice(8, 12) +
        "-" +
        hex.slice(12, 16) +
        "-" +
        hex.slice(16, 20) +
        "-" +
        hex.slice(20);
    }
    try {
      const data = await api<{ result: SavedDraw; quota: Quota }>("draw", {
        id: pendingId.current,
        clues,
        mode: selectedMode,
      });
      pendingId.current = null;
      setPrepared(data.result);
      setQuota(data.quota);
      restored.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法拆开，请重试。");
      locked.current = false;
      void refreshQuota();
    } finally {
      locked.current = false;
      setWaiting(false);
    }
  }
  function open() {
    if (locked.current || !prepared) return;
    locked.current = true;
    accept(prepared);
    setPrepared(null);
    setScene("opening");
  }
  function again() {
    void prepare(mode, true);
  }
  function restore(d: Draw) {
    const b = catalogue.get(d.bookId);
    if (!b) return;
    setCurrent(b);
    setDrawId(d.serverId);
    setBookMode(d.mode ?? "smart");
    setMode(d.mode ?? "smart");
    setUnlocked(false);
    setDiagnostic(undefined);
    setCurrentClues(d.selections);
    setUsedCache(false);
    setScene("reading");
    setPanel(null);
  }
  function save() {
    if (current)
      setFavorites((old) =>
        old.includes(current.id)
          ? old.filter((id) => id !== current.id)
          : [current.id, ...old],
      );
  }
  if (privateLocked)
    return (
      <div className="experience private-gate">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("unlock", { code: passcode });
              setPasscode("");
              await refreshQuota();
            } catch (e) {
              setError(e instanceof Error ? e.message : "暂时无法进入。");
            }
          }}
        >
          <h1>页间 · 私用</h1>
          <label htmlFor="play-code">访问口令</label>
          <input
            id="play-code"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button className="scene-next" type="submit">
            进入
          </button>
          <p role="status">{error}</p>
        </form>
      </div>
    );
  return (
    <div className="experience">
      <a href="#playfield" className="skip-link">
        跳到互动区域
      </a>
      <header className="experience-header">
        <div className="edge-brand">
          页间<span aria-hidden="true"> / </span>
        </div>
        {scene === "clues" && (waiting || prepared) && (
          <button className="task-resume" onClick={() => setScene("parcel")}>
            {waiting ? "查看找书进度" : "书已备好"}
          </button>
        )}
        {scene === "clues" && current && !waiting && !prepared && (
          <button
            className="return-current"
            onClick={() => setScene("reading")}
          >
            继续看这本书
          </button>
        )}
        <nav className="edge-tools" aria-label="阅读记录">
          <button
            disabled={scene === "opening" || waiting}
            onClick={() => setPanel("history")}
            aria-label="抽过的书"
          >
            <History size={18} />
          </button>
          <button
            disabled={scene === "opening" || waiting}
            onClick={() => setPanel("shelf")}
            aria-label="留下的书"
          >
            <Bookmark size={18} />
          </button>
        </nav>
      </header>
      {(scene === "clues" || scene === "parcel") && (
        <div className="draw-mode" role="group" aria-label="抽书方式">
          {(["smart", "light"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              disabled={waiting || (scene === "parcel" && !!prepared)}
              onClick={() => {
                setMode(value);
                pendingId.current = null;
                setError("");
                if (scene === "parcel") void prepare(value);
              }}
            >
              {value === "smart" ? "推敲选书" : "随手抽书"}
            </button>
          ))}
          <small>
            {!smartAvailable
              ? "推敲暂不可用，仍可随手抽书。"
              : mode === "smart"
                ? "循着线索，比较后再选。"
                : "按线索随手抽，不耗推敲机会。"}
          </small>
        </div>
      )}
      <main id="playfield" className="playfield">
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {scene === "clues" ? (
              <motion.div
                className="scene-layer"
                key="clues"
                initial={reduce ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -35 }}
                transition={{ duration: 0.28 }}
              >
                <ClueScene
                  selected={clues}
                  onChange={setClues}
                  onContinue={next}
                />
              </motion.div>
            ) : scene === "reading" && current ? (
              <motion.div
                className="scene-layer"
                key="reading"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  scale: reduce ? 1 : 0.96,
                  x: reduce ? 0 : 55,
                }}
                transition={{ duration: 0.28 }}
              >
                <ReadingScene
                  key={current.id}
                  book={current}
                  drawId={drawId}
                  canDraw={mode === "light" || (!!quota && quota.remaining > 0)}
                  mode={bookMode}
                  unlocked={unlocked}
                  quota={quota}
                  diagnostic={diagnostic}
                  onQuota={setQuota}
                  onHome={() => setScene("clues")}
                  clues={currentClues}
                  cached={usedCache}
                  saved={favorites.includes(current.id)}
                  onSave={save}
                  onAgain={again}
                />
              </motion.div>
            ) : (
              <motion.div
                className="scene-layer"
                key="parcel"
                initial={reduce ? false : { opacity: 0, scale: 0.94, y: 25 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: scene === "opening" ? 1 : 0 }}
                transition={{
                  duration: reduce ? 0 : scene === "opening" ? 0.45 : 0.22,
                }}
              >
                <ParcelScene
                  clues={waiting || prepared ? searchClues : clues}
                  opening={scene === "opening"}
                  book={prepared?.book ?? current ?? undefined}
                  onOpen={open}
                  onOpened={() => {
                    setScene("reading");
                    locked.current = false;
                  }}
                  onBack={() => {
                    setScene("clues");
                  }}
                  waiting={waiting}
                  ready={!!prepared}
                  exhausted={
                    !prepared &&
                    mode === "smart" &&
                    (!quota || quota.remaining === 0)
                  }
                  phase={phase}
                  error={error}
                  onRetry={() => void prepare()}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </main>
      <QuotaNotice
        quota={quota}
        error={quotaError}
        onRetry={() => void refreshQuota()}
      />
      <div
        className="scene-position"
        role="img"
        aria-label={
          scene === "clues"
            ? "第一幕：纸签"
            : scene === "reading"
              ? "第三幕：书"
              : "第二幕：包裹"
        }
      >
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className={
              (scene === "clues" ? 0 : scene === "reading" ? 2 : 1) === i
                ? "active"
                : ""
            }
          />
        ))}
      </div>
      {(cacheError || favoriteError || historyError) && (
        <p className="storage-toast" role="status">
          本次记录无法保存，关闭后会丢失。
        </p>
      )}
      {panel && (
        <Sheet
          title={panel === "shelf" ? "留下的" : "抽过的"}
          onClose={() => setPanel(null)}
        >
          <div className="archive-list">
            {(panel === "shelf"
              ? favorites.map(
                  (id) =>
                    history.find((d) => d.bookId === id) ?? {
                      bookId: id,
                      time: 0,
                      selections: [],
                      matched: [],
                      exploration: true,
                    },
                )
              : history
            )
              .filter((d) => catalogue.has(d.bookId))
              .map((d, i) => (
                <button key={d.bookId + i} onClick={() => restore(d)}>
                  <BookOpen size={18} />
                  <span>
                    <strong>{catalogue.get(d.bookId)?.title}</strong>
                    <small>{catalogue.get(d.bookId)?.author}</small>
                  </span>
                  {panel === "shelf" && <CheckMark />}
                </button>
              ))}
          </div>
          {(panel === "shelf" ? favorites : history).length === 0 && (
            <p className="empty">还没有。</p>
          )}
          <button className="archive-close" onClick={() => setPanel(null)}>
            <X size={14} />
            回去
          </button>
        </Sheet>
      )}
    </div>
  );
}
function CheckMark() {
  return <span aria-hidden="true">✓</span>;
}
