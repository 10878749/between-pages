import { useRef, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
  useIsPresent,
} from "motion/react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import type { Selection, Book } from "../data/types";
import { BookCover } from "./BookCover";
export function ParcelScene({
  clues,
  opening,
  book,
  onOpen,
  onOpened,
  onBack,
  waiting,
  exhausted,
  error,
  onRetry,
  phase,
  ready,
}: {
  clues: Selection[];
  opening: boolean;
  book?: Book;
  onOpen: () => void;
  onOpened: () => void;
  onBack: () => void;
  waiting: boolean;
  exhausted: boolean;
  error: string;
  onRetry: () => void;
  phase: string;
  ready: boolean;
}) {
  const reduce = useReducedMotion();
  const present = useIsPresent();
  const completeOpening = useRef(onOpened);
  useEffect(() => {
    completeOpening.current = onOpened;
  }, [onOpened]);
  const pull = useMotionValue(0),
    start = useRef<{ x: number; y: number } | null>(null),
    threshold = useRef(85);
  const left = useTransform(pull, [0, 180], [0, reduce ? 0 : -100]),
    right = useTransform(pull, [0, 180], [0, reduce ? 0 : 100]),
    lift = useTransform(pull, [0, 180], [0, reduce ? 0 : -18]),
    fade = useTransform(pull, [0, 160], [1, 0]);
  const motionControl = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(() => {
    if (opening)
      motionControl.current = animate(pull, 200, {
        duration: reduce ? 0 : 0.65,
        ease: [0.23, 1, 0.32, 1],
        onComplete: () => completeOpening.current(),
      });
    return () => motionControl.current?.stop();
  }, [opening, pull, reduce]);
  function reset() {
    start.current = null;
    motionControl.current = animate(pull, 0, {
      type: "spring",
      duration: 0.5,
      bounce: 0.1,
    });
  }
  return (
    <section className="parcel-scene-new" aria-label="拆开包裹">
      <button className="scene-back" onClick={onBack} disabled={opening || !present} style={{ visibility: present ? "visible" : "hidden" }}>
        <ArrowLeft size={15} />
        纸签
      </button>
      <div className="parcel-stage">
        <div className="parcel-visual">
          <motion.div className="parcel-object" style={{ y: lift }}>
            {opening && book && (
              <motion.div
              className="under-book"
              layoutCrossfade={false}
                layoutId={reduce ? undefined : "opening-book-" + book.id}
                transition={{
                  layout: {
                    duration: reduce ? 0 : 0.45,
                    ease: [0.32, 0.72, 0, 1],
                  },
                }}
                aria-hidden="true"
              >
                <BookCover book={book} />
              </motion.div>
            )}
            <motion.div
              className="paper-half paper-left"
              style={{ rotateY: left, opacity: fade }}
            />
            <motion.div
              className="paper-half paper-right"
              style={{ rotateY: right, opacity: fade }}
            />
            <motion.div className="paper-face" style={{ opacity: fade }}>
              <span className="quiet-seal">页间</span>
              <div className="parcel-clues">
                {clues.map((c) => (
                  <motion.span layoutId={"clue-" + c.id} key={c.id}>
                    {c.label}
                  </motion.span>
                ))}
              </div>
            </motion.div>
            <motion.button
              className="paper-pull whole-seal"
              style={{ x: pull, opacity: fade }}
              aria-label="向右拉开纸带"
              disabled={opening || waiting || !ready}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen();
                }
              }}
              onPointerDown={(e) => {
                if (
                  !ready ||
                  waiting ||
                  opening ||
                  !e.isPrimary ||
                  e.button !== 0
                )
                  return;
                motionControl.current?.stop();
                start.current = { x: e.clientX, y: e.clientY };
                threshold.current = e.pointerType === "touch" ? 24 : 55;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (start.current !== null) {
                  const dx = e.clientX - start.current.x,
                    dy = e.clientY - start.current.y;
                  if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
                    reset();
                    return;
                  }
                  pull.set(Math.min(140, Math.max(0, dx)));
                }
              }}
              onPointerUp={(e) => {
                if (start.current === null) return;
                const dx = e.clientX - start.current.x,
                  dy = e.clientY - start.current.y;
                const enough =
                  dx >= threshold.current && dx > Math.abs(dy) * 1.2;
                start.current = null;
                if (enough) {
                  onOpen();
                  if (!book) reset();
                } else reset();
              }}
              onPointerCancel={reset}
              onLostPointerCapture={() => {
                if (start.current !== null) reset();
              }}
            >
              <span className="seal-paper" aria-hidden="true" />
              {ready && !opening && (
                <motion.span
                  className="seal-arrow"
                  aria-hidden="true"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1, x: reduce ? 0 : [0, 7, 0, 7, 0] }}
                  transition={{
                    opacity: { duration: 0.25 },
                    x: { duration: 1.5, ease: "easeInOut", delay: 0.25 },
                  }}
                >
                  <ArrowRight size={19} />
                </motion.span>
              )}
            </motion.button>
          </motion.div>
        </div>
      </div>
      <div className="parcel-feedback" aria-live="polite" aria-atomic="true" style={{ visibility: present ? "visible" : "hidden" }}>
        {ready && !opening ? (
          <motion.div
            key="ready"
            className="parcel-ready"
            initial={reduce ? false : { opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <p className="ready-title">书已备好</p>
            <motion.p
              className="gesture-hint"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.25 }}
            >
              向右拉开
            </motion.p>
            <motion.button
              className="scene-next"
              onClick={onOpen}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.25 }}
            >
              拆开
              <ArrowRight size={16} />
            </motion.button>
          </motion.div>
        ) : (
          <p className="gesture-hint">
            {opening
              ? " "
              : error ||
                (waiting
                  ? phase + "…"
                  : exhausted
                    ? "推敲机会已用完，仍可切换随手抽书。"
                    : "等待找书")}
          </p>
        )}
        {error && !waiting && (
          <button className="scene-next" onClick={onRetry}>
            重试
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
