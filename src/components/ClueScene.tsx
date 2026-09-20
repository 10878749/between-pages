import { useState, useRef } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "motion/react";
import { ArrowDown, ArrowRight, RotateCcw, Plus, Check, X } from "lucide-react";
import { tags, categories, selectionFor } from "../data/tags";
import type { Selection } from "../data/types";
import {
  LocalTagInterpreter,
  normalize,
} from "../lib/recommendation/tagInterpreter";
import { Sheet } from "./Sheet";
const themes = [
  { id: "mood", label: "心情" },
  { id: "emotion", label: "想得到什么" },
  { id: "personality", label: "MBTI" },
  { id: "atmosphere", label: "氛围" },
  { id: "genre", label: "类型" },
  { id: "readingStyle", label: "怎么读" },
];
const short: Record<string, string> = {
  想安静一下: "安静",
  想看点奇怪的: "奇异",
  想离开现实: "远方",
  想要一点温柔: "温柔",
  给我一点后劲: "余韵",
};
function Clue({
  label,
  choose,
  replace,
  index,
  kept,
}: {
  label: string;
  choose: () => void;
  replace: () => void;
  index: number;
  kept: boolean;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0),
    y = useMotionValue(0);
  const rotation = useTransform(x, [-120, 120], [-14, 14]);
  const moved = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <motion.button
      layoutId={reduce ? undefined : "clue-" + label}
      className={"clue-card" + (kept ? " is-kept" : "")}
      aria-pressed={kept}
      aria-label={`留下 ${short[label] ?? label}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{
        duration: reduce ? 0.1 : 0.24,
        layout: { type: "spring", duration: reduce ? 0 : 0.45, bounce: 0.08 },
      }}
      style={{ x, y, rotate: reduce ? 0 : rotation }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        moved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x,
          dy = e.clientY - start.current.y;
        moved.current = Math.abs(dx) + Math.abs(dy) > 8;
        x.set(dx);
        y.set(dy);
      }}
      onPointerUp={() => {
        start.current = null;
        if (y.get() > 45) {
          animate(x, 0);
          animate(y, 0);
          choose();
          return;
        }
        if (Math.abs(x.get()) > 60 || y.get() < -45) {
          animate(x, 0, { duration: reduce ? 0 : 0.22 });
          animate(y, 0, { duration: reduce ? 0 : 0.22 });
          replace();
          return;
        }
        animate(x, 0, { type: "spring", duration: 0.5, bounce: 0.1 });
        animate(y, 0, { type: "spring", duration: 0.5, bounce: 0.1 });
      }}
      onPointerCancel={() => {
        start.current = null;
        animate(x, 0);
        animate(y, 0);
        moved.current = true;
      }}
      onLostPointerCapture={() => {
        if (start.current) {
          start.current = null;
          animate(x, 0);
          animate(y, 0);
        }
      }}
      onClick={() => {
        if (!moved.current) choose();
      }}
    >
      <span className="clue-mark" aria-hidden="true">
        {kept ? <Check size={18} /> : ["○", "⋮", "⌁", "◇", "☾", "✧"][index]}
      </span>
      <span
        className={"clue-label" + (/^[A-Z]+$/.test(label) ? " is-latin" : "")}
      >
        {short[label] ?? label}
      </span>
      <i aria-hidden="true" />
    </motion.button>
  );
}
export function ClueScene({
  selected,
  onChange,
  onContinue,
}: {
  selected: Selection[];
  onChange: (s: Selection[]) => void;
  onContinue: () => void;
}) {
  const reduce = useReducedMotion();
  const changing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0),
    [more, setMore] = useState(false),
    [category, setCategory] = useState("mood"),
    [custom, setCustom] = useState(""),
    [message, setMessage] = useState("");
  const [themeIndex, setThemeIndex] = useState(0);
  const theme = themes[themeIndex];
  const themeTags = tags.filter((t) => t.category === theme.id);
  const hands = Math.ceil(themeTags.length / 6);
  const group = themeTags
    .slice((round % hands) * 6, (round % hands) * 6 + 6)
    .map((t) => t.id);
  function changeTheme(index: number) {
    if (changing.current || index === themeIndex) return;
    changing.current = true;
    setBusy(true);
    setThemeIndex(index);
    setRound(0);
  }
  function changeHand() {
    if (changing.current || hands <= 1) return;
    changing.current = true;
    setBusy(true);
    setRound((r) => r + 1);
  }
  function toggle(label: string) {
    if (selected.some((s) => s.id === label))
      onChange(selected.filter((s) => s.id !== label));
    else add(label);
  }
  function add(label: string) {
    if (!selected.some((s) => s.id === label))
      onChange([
        ...selected,
        { ...selectionFor(label), label: short[label] ?? label },
      ]);
  }
  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!normalize(custom)) return;
    if (selected.some((s) => normalize(s.label) === normalize(custom))) {
      setMessage("已经留下了。");
      return;
    }
    const r = await new LocalTagInterpreter().interpret(custom.trim());
    const id = "custom-" + Date.now();
    onChange([
      ...selected,
      {
        id,
        label: custom.trim(),
        tagIds: r.mappedTagIds,
        custom: { ...r, id, source: "custom" },
      },
    ]);
    setCustom("");
    setMessage(r.confidence ? "已留下。" : "未读懂这条线索，仍为你保留。");
  }
  return (
    <section className="clue-scene" aria-label="留下线索">
      <nav className="theme-tabs" aria-label="纸签主题">
        {themes.map((t, i) => (
          <button
            key={t.id}
            aria-pressed={themeIndex === i}
            disabled={busy}
            onClick={() => changeTheme(i)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <h1>{theme.label}</h1>
      <div
        className="clue-deck"
        aria-busy={busy}
        aria-label={theme.label + "牌组"}
      >
        <AnimatePresence mode="wait">
          <motion.div
            className="fan-hand"
            key={theme.id + round}
            initial="gathered"
            animate="dealt"
            exit="gathered"
            variants={{
              gathered: {
                opacity: 0,
                transition: {
                  when: "afterChildren",
                  duration: 0,
                  staggerChildren: reduce ? 0 : 0.025,
                  staggerDirection: -1,
                },
              },
              dealt: {
                opacity: 1,
                transition: {
                  when: "beforeChildren",
                  duration: 0,
                  staggerChildren: reduce ? 0 : 0.035,
                },
              },
            }}
            onAnimationComplete={(definition) => {
              if (definition === "dealt") {
                changing.current = false;
                setBusy(false);
              }
            }}
          >
            {group.map((label, i) => (
              <motion.div
                className="fan-slot"
                key={label}
                variants={{
                  gathered: {
                    transform: "translateX(-50%) translateY(36px) rotate(0deg)",
                    transition: {
                      duration: reduce ? 0 : 0.22,
                      ease: [0.77, 0, 0.175, 1],
                    },
                  },
                  dealt: {
                    transform: `translateX(calc(-50% + ${i - (group.length - 1) / 2} * var(--fan-step))) translateY(${Math.pow(i - (group.length - 1) / 2, 2) * 5}px) rotate(${(i - (group.length - 1) / 2) * 5}deg)`,
                    transition: {
                      duration: reduce ? 0 : 0.28,
                      ease: [0.23, 1, 0.32, 1],
                    },
                  },
                }}
              >
                {selected.some((s) => s.id === label) ? (
                  <div className="clue-card card-place" aria-hidden="true" />
                ) : (
                  <Clue
                    label={label}
                    index={i}
                    kept={selected.some((s) => s.id === label)}
                    choose={() => {
                      if (!changing.current) toggle(label);
                    }}
                    replace={changeHand}
                  />
                )}
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="gesture-hint">点选或下拉留下 · 左右推牌换一手</p>
      <p className="hand-count" aria-live="polite">
        {(round % hands) + 1} / {hands}
      </p>
      <div className="collected" aria-label="已留下的纸签">
        <AnimatePresence>
          {selected.map((s) => (
            <motion.button
              layoutId={reduce ? undefined : "clue-" + s.id}
              layout
              transition={{
                layout: {
                  type: "spring",
                  duration: reduce ? 0 : 0.45,
                  bounce: 0.08,
                },
                duration: reduce ? 0 : 0.16,
              }}
              key={s.id}
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onChange(selected.filter((c) => c.id !== s.id))}
              aria-label={`移除 ${s.label}`}
            >
              <span>{s.label}</span>
              <X size={11} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <div className="clue-options">
        <button onClick={changeHand} disabled={busy || hands <= 1}>
          <RotateCcw size={14} />
          换一手
        </button>
        <button onClick={() => setMore(true)}>
          <Plus size={14} />
          其他纸签
        </button>
      </div>
      <button className="scene-next" onClick={onContinue}>
        {selected.length ? "就这些" : "随意"}
        <ArrowRight size={18} />
      </button>
      <p className="quiet-note">
        {theme.id === "personality" ? "性格只作线索。" : " "}
      </p>
      {more && (
        <Sheet title="纸签" onClose={() => setMore(false)}>
          <form className="write-clue" onSubmit={addCustom}>
            <input
              name="clue"
              aria-label="写下自己的纸签"
              maxLength={60}
              placeholder="自己写…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button aria-label="留下自己的纸签">
              <ArrowDown size={18} />
            </button>
          </form>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                aria-pressed={category === c.id}
                key={c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="all-clues">
            {tags
              .filter((t) => t.category === category)
              .map((t) => (
                <button
                  key={t.id}
                  aria-pressed={selected.some((s) => s.id === t.id)}
                  onClick={() =>
                    selected.some((s) => s.id === t.id)
                      ? onChange(selected.filter((s) => s.id !== t.id))
                      : add(t.id)
                  }
                >
                  {t.label}
                  {selected.some((s) => s.id === t.id) && <Check size={12} />}
                </button>
              ))}
          </div>
          <p role="status" className="quiet-note">
            {message}
          </p>
          <button className="scene-next" onClick={() => setMore(false)}>
            好了
            <Check size={16} />
          </button>
        </Sheet>
      )}
    </section>
  );
}
