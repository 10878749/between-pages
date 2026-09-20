import { useRef, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Book, Selection, BoxState } from "../data/types";
import { BookCover } from "./BookCover";
export function BlindBox({
  selected,
  state,
  book,
  onRemove,
  onOpen,
  onDragState,
  onSurprise,
}: {
  selected: Selection[];
  state: BoxState;
  book?: Book;
  onRemove: (id: string) => void;
  onOpen: () => void;
  onDragState: (dragging: boolean) => void;
  onSurprise: () => void;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0),
    start = useRef<number | null>(null),
    threshold = useRef(90);
  const control = useRef<ReturnType<typeof animate> | null>(null);
  const left = useTransform(x, [0, 150], [0, reduce ? 0 : -20]),
    right = useTransform(x, [0, 150], [0, reduce ? 0 : 20]),
    lift = useTransform(x, [0, 150], [0, reduce ? 0 : -12]),
    light = useTransform(x, [0, 150], [0, 0.55]);
  const opening = state === "opening";
  useEffect(() => {
    if (opening)
      control.current = animate(x, 200, {
        duration: reduce ? 0 : 0.35,
        ease: "easeOut",
      });
    return () => control.current?.stop();
  }, [opening, x, reduce]);
  function reset() {
    start.current = null;
    control.current = animate(x, 0, {
      type: "spring",
      stiffness: 260,
      damping: 28,
    });
    onDragState(false);
  }
  return (
    <section
      className={"ritual " + (opening ? "is-opening" : "")}
      aria-label="等待拆开的阅读盲盒"
    >
      <div className="section-label">02 / 遇见未知</div>
      <div className="parcel-scene">
        <motion.div className="ambient-light" style={{ opacity: light }} />
        <motion.div
          className="parcel"
          style={{ y: lift, rotate: reduce ? 0 : -7 }}
        >
          {book && opening && (
            <div className="hidden-book">
              <BookCover book={book} />
            </div>
          )}
          <motion.div className="fold fold-left" style={{ rotateY: left }} />
          <motion.div className="fold fold-right" style={{ rotateY: right }} />
          <div className="parcel-note">
            <span>
              TO SOMEONE,
              <br />
              SOMEWHERE.
            </span>
            <p>一本尚未相遇的书</p>
            <small>在这里，等你拆开。</small>
          </div>
          <motion.div className="ribbon" style={{ x }}>
            <span>BETWEEN PAGES · 为你保留的偶然</span>
          </motion.div>
          <motion.button
            className="pull-tab"
            style={{ x }}
            aria-label="向右拖开纸带，也可按回车拆开"
            disabled={opening}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }}
            onPointerDown={(e) => {
              if (opening) return;
              control.current?.stop();
              start.current = e.clientX;
              threshold.current = e.pointerType === "touch" ? 50 : 90;
              e.currentTarget.setPointerCapture(e.pointerId);
              onDragState(true);
            }}
            onPointerMove={(e) => {
              if (start.current !== null)
                x.set(Math.min(155, Math.max(0, e.clientX - start.current)));
            }}
            onPointerUp={(e) => {
              if (start.current === null) return;
              const success = x.get() >= threshold.current;
              start.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
              if (success) onOpen();
              else reset();
            }}
            onPointerCancel={reset}
            onLostPointerCapture={() => {
              if (start.current !== null) reset();
            }}
          >
            <ArrowRight size={19} />
          </motion.button>
          <div className="attached-tags">
            <AnimatePresence>
              {selected.map((s, i) => (
                <motion.button
                  key={s.id}
                  title={`揭下「${s.label}」`}
                  aria-label={`揭下纸签 ${s.label}`}
                  initial={reduce ? false : { opacity: 0, y: -12, rotate: -8 }}
                  animate={{ opacity: 1, y: 0, rotate: i % 2 ? -4 : 3 }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: -15, rotate: 12, scale: 0.92 }
                  }
                  transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
                  onClick={() => onRemove(s.id)}
                  disabled={opening}
                >
                  {s.label}
                  <span aria-hidden="true"> ×</span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
          <span className="parcel-stamp">
            页<br />间
          </span>
        </motion.div>
      </div>
      <p className="drag-hint" aria-live="polite">
        {opening
          ? "纸页之间，正在相遇……"
          : state === "dragging"
            ? "再轻轻拉开一点……"
            : "轻轻向右拉开纸带"}
      </p>
      <button className="primary" onClick={onOpen} disabled={opening}>
        拆开这盒书 <ArrowUpRight size={17} />
      </button>
      <button className="surprise" onClick={onSurprise} disabled={opening}>
        什么都不选，直接给我一本
      </button>
    </section>
  );
}
