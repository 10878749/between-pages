import { useState, useEffect, useRef } from "react";
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useTransform,
  animate,
} from "motion/react";
import {
  Bookmark,
  Check,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { api, type Quota, type DetailResult } from "../lib/api";
const detailRequests = new Map<string, Promise<DetailResult>>();
function requestDetails(
  id: string,
  retry = false,
  upgrade = false,
  peek = false,
) {
  let request = detailRequests.get(id);
  if (!request) {
    request = api<DetailResult>("details", {
      id,
      retry,
      upgrade,
      peek,
    }).finally(() => detailRequests.delete(id));
    detailRequests.set(id, request);
  }
  return request;
}
import type { Book, Selection } from "../data/types";
import { authors } from "../data/authors";
import { BookCover } from "./BookCover";
import {
  getAvailability,
  type AvailabilityResult,
} from "../lib/providers/availability";
import { providerSearch } from "../lib/providers/providerSearch";
export function ReadingScene({
  book,
  drawId,
  canDraw,
  clues,
  cached,
  saved,
  onSave,
  onAgain,
  onHome,
  mode,
  unlocked,
  quota,
  onQuota,
  diagnostic,
}: {
  mode: "smart" | "light";
  unlocked: boolean;
  quota: Quota | null;
  onQuota: (quota: Quota) => void;
  onHome: () => void;
  diagnostic?: unknown;
  book: Book;
  drawId?: string;
  canDraw: boolean;
  clues: Selection[];
  cached: boolean;
  saved: boolean;
  onSave: () => void;
  onAgain: () => void;
}) {
  const [hasAccess, setHasAccess] = useState(unlocked || mode === "smart");
  const [detailDiagnostic, setDetailDiagnostic] = useState<unknown>();
  const missingLines = [
    "简介请假了。",
    "书到了，介绍没跟上。",
    "这回没有导读，直接见书。",
    "封面先到了，简介还在路上。",
  ];
  const missingLine =
    missingLines[
      Array.from(drawId ?? book.id).reduce(
        (sum, c) => sum + c.charCodeAt(0),
        0,
      ) % missingLines.length
    ];
  const originalSummary = book.bookSummary.startsWith("外部书库暂未")
    ? ""
    : book.bookSummary;
  const [flipped, setFlipped] = useState(false);
  const [context, setContext] = useState<DetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  async function retryDetails() {
    if (!drawId || loading) return;
    setLoading(true);
    try {
      const result = await requestDetails(drawId, true, mode === "light");
      setContext(result);
      setDetailDiagnostic(result.diagnostic);
      if (result.quota) onQuota(result.quota);
      if (result.status === "ready") setHasAccess(true);
    } catch {
      setContext({ status: "failed", message: "介绍暂未补全，稍后可重试。" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    if (drawId) {
      setLoading(true);
      void requestDetails(drawId, false, false, mode === "light")
        .then((r) => {
          if (active) {
            setContext(r);
            if (r.unlocked || r.status === "ready") setHasAccess(true);
          }
        })
        .catch(() => {
          if (active)
            setContext({
              status: "failed",
              message: "介绍暂未补全，稍后可重试。",
            });
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [drawId, mode]);
  const [availability, setAvailability] = useState<AvailabilityResult>({
    links: providerSearch(book),
    status: "empty",
  });
  const reduce = useReducedMotion();
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-150, 150], [-8, 8]);
  function resetDrag() {
    pointer.current = null;
    animate(dragX, 0, { type: "spring", duration: 0.5, bounce: 0.2 });
  }
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!flipped) return;
    let active = true;
    getAvailability(book).then((r) => {
      if (active) setAvailability(r);
    });
    return () => {
      active = false;
    };
  }, [book, flipped]);
  const source = book.source;
  return (
    <section
      className={"reading-scene " + (flipped ? "is-flipped" : "")}
      aria-label="这次抽到的书"
    >
      <button className="reading-home" onClick={onHome}>
        <ArrowLeft size={15} />
        返回选牌
      </button>
      <h1 ref={heading} tabIndex={-1} className="sr-only">
        {book.title}
      </h1>
      {!flipped ? (
        <motion.div
          key="front"
          className="reading-front"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.button
            className="book-touch"
            layoutCrossfade={false}
            layoutId={reduce ? undefined : "opening-book-" + book.id}
            transition={{
              layout: { duration: reduce ? 0 : 0.45, ease: [0.32, 0.72, 0, 1] },
            }}
            style={{ x: dragX, rotate: reduce ? 0 : rotate }}
            aria-label={`翻开 ${book.title}`}
            onClick={(e) => {
              if (e.detail === 0 || !swiped.current) setFlipped(true);
            }}
            onPointerDown={(e) => {
              if (!e.isPrimary || e.button !== 0) return;
              pointer.current = { x: e.clientX, y: e.clientY };
              swiped.current = false;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!pointer.current) return;
              const dx = e.clientX - pointer.current.x;
              if (Math.abs(dx) > 8) swiped.current = true;
              dragX.set(dx);
            }}
            onPointerUp={(e) => {
              if (!pointer.current) return;
              const dx = e.clientX - pointer.current.x;
              const dy = e.clientY - pointer.current.y;
              const threshold = e.pointerType === "touch" ? 45 : 60;
              const commit =
                Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy);
              resetDrag();
              if (commit) {
                swiped.current = true;
                if (dx > 0) {
                  if (canDraw) onAgain();
                } else setFlipped(true);
              }
            }}
            onPointerCancel={() => {
              swiped.current = true;
              resetDrag();
            }}
            onLostPointerCapture={() => {
              if (pointer.current) resetDrag();
            }}
          >
            <BookCover book={book} />
          </motion.button>
          <p className="gesture-hint">
            {canDraw ? "左划翻开 · 右划换一本" : "左划翻开"}
          </p>
          <div className="reading-actions">
            <button onClick={onSave} aria-pressed={saved}>
              {saved ? <Check size={17} /> : <Bookmark size={17} />}{" "}
              {saved ? "已留" : "留下"}
            </button>
            <button className="scene-next" onClick={() => setFlipped(true)}>
              翻开
              <ArrowRight size={16} />
            </button>
            <button onClick={onAgain} disabled={!canDraw}>
              再抽
              <ArrowRight size={17} />
            </button>
          </div>
          {cached && (
            <p className="quiet-note" role="status">
              离线书目
            </p>
          )}
        </motion.div>
      ) : (
        <motion.div
          key="inside"
          className="open-pages"
          initial={reduce ? { opacity: 0 } : { opacity: 0, rotateY: -12 }}
          animate={{ opacity: 1, rotateY: 0 }}
          transition={{ duration: 0.28 }}
        >
          <button className="close-pages" onClick={() => setFlipped(false)}>
            <ArrowLeft size={15} />
            合上
          </button>
          <div className="inside-scroll">
            <h2>{book.title}</h2>
            <p className="inside-author">{book.author}</p>
            {clues.length > 0 && (
              <p className="small-clues">
                {clues.map((c) => c.label).join(" / ")}
              </p>
            )}
            <p className="synopsis">
              {context?.details?.summary ||
                (originalSummary && /\p{Script=Han}/u.test(originalSummary)
                  ? originalSummary
                  : "") ||
                (mode === "light"
                  ? missingLine
                  : loading
                    ? "正在整理介绍…"
                    : "书目信息已到，介绍待补。")}
            </p>
            {!context?.details &&
              originalSummary &&
              !/\p{Script=Han}/u.test(originalSummary) && (
                <details className="ai-sources">
                  <summary>查看书库原文</summary>
                  <p>{originalSummary}</p>
                </details>
              )}
            {context?.details && (
              <>
                {context.details.authorBio && (
                  <section className="editorial-section">
                    <h3>关于作者</h3>
                    <p>{context.details.authorBio}</p>
                  </section>
                )}
                {context.details.why && (
                  <section className="editorial-section">
                    <h3>
                      {mode === "light" ? "它与你的线索" : "为什么是这本书"}
                    </h3>
                    <p>{context.details.why}</p>
                  </section>
                )}
                {context.details.readingNote && (
                  <section className="editorial-section">
                    <h3>怎么读</h3>
                    <p>{context.details.readingNote}</p>
                  </section>
                )}
                <details className="ai-sources">
                  <summary>推敲手记 · 资料与说明</summary>
                  {context.details.sources.map((url) =>
                    url === "/editorial-notes" ? (
                      <span key={url}>页间原有编辑资料</span>
                    ) : (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {url === "/editorial-notes"
                          ? "页间原有编辑资料"
                          : new URL(url).hostname}{" "}
                        ↗
                      </a>
                    ),
                  )}
                  <p>
                    内容由自动生成服务依据所列资料整理，阅读建议含推断。作者资料不足时保留空缺。
                  </p>
                </details>
              </>
            )}
            {drawId && (
              <div className="detail-status" role="status">
                {loading ? "正在整理介绍…" : context?.message}
                {!loading &&
                  context &&
                  ["failed", "busy", "limited"].includes(context.status) &&
                  hasAccess && (
                    <button onClick={() => void retryDetails()}>
                      再试一次 · 不另扣机会
                    </button>
                  )}
              </div>
            )}
            {drawId && mode === "light" && !context?.details && (
              <div className="upgrade-note">
                <p>
                  {hasAccess
                    ? "这本书已可推敲。"
                    : "想多了解这本书？推敲可补写介绍、作者与线索之间的联系。"}
                </p>
                <button
                  onClick={() => void retryDetails()}
                  disabled={
                    loading || (!hasAccess && (!quota || quota.remaining === 0))
                  }
                >
                  {loading
                    ? "正在推敲…"
                    : hasAccess
                      ? "推敲这本书 · 不另扣机会"
                      : "推敲这本书 · 使用 1 次机会"}
                </button>
                {!hasAccess && quota?.remaining === 0 && (
                  <small>本时段机会已用完，补满后再来。</small>
                )}
              </div>
            )}
            {context?.details && !context.details.authorBio && (
              <p className="quiet-note">作者资料尚不足，先留白。</p>
            )}
            {!!quota?.unlimited &&
              (diagnostic != null || detailDiagnostic != null) && (
                <details className="test-diagnostic">
                  <summary>测试记录</summary>
                  <pre>
                    {JSON.stringify(
                      { selection: diagnostic, details: detailDiagnostic },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
            {authors[book.authorId] && (
              <details>
                <summary>作者</summary>
                <p>{authors[book.authorId].shortBio}</p>
              </details>
            )}
            <div className="edition-line">
              {[
                book.publisher,
                book.pageCount ? `${book.pageCount} 页` : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="read-links">
              {availability.links
                .filter(
                  (l) =>
                    l.verified ||
                    ["微信读书", "当当", "京东"].includes(l.provider),
                )
                .map((l, i) => (
                  <a
                    key={l.url + i}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {l.label}
                    <ExternalLink size={13} />
                  </a>
                ))}
            </div>
            {source && (
              <a
                className="source-link"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.provider} · 书目来源 ↗
              </a>
            )}
            <p className="rights-note">阅读权限以平台和版本为准。</p>
          </div>
          <div className="reading-actions">
            <button onClick={onSave} aria-pressed={saved}>
              {saved ? <Check size={16} /> : <Bookmark size={16} />}{" "}
              {saved ? "已留" : "留下"}
            </button>
            <button onClick={onAgain} disabled={!canDraw}>
              再抽
              <ArrowRight size={17} />
            </button>
          </div>
        </motion.div>
      )}
    </section>
  );
}
