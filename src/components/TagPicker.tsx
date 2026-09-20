import { useState } from "react";
import { ArrowRight, ArrowUpRight, Search, Check } from "lucide-react";
import { categories, tags, suggested, selectionFor } from "../data/tags";
import type { Selection, TagCategory } from "../data/types";
import {
  LocalTagInterpreter,
  normalize,
} from "../lib/recommendation/tagInterpreter";
import { Sheet } from "./Sheet";
const interpreter = new LocalTagInterpreter();
export function TagPicker({
  selected,
  onChange,
  onSurprise,
}: {
  selected: Selection[];
  onChange: (next: Selection[]) => void;
  onSurprise: () => void;
}) {
  const [expanded, setExpanded] = useState(false),
    [category, setCategory] = useState<TagCategory>("mood"),
    [query, setQuery] = useState(""),
    [custom, setCustom] = useState(""),
    [message, setMessage] = useState("");
  function toggle(id: string) {
    onChange(
      selected.some((s) => s.id === id)
        ? selected.filter((s) => s.id !== id)
        : [...selected, selectionFor(id)],
    );
  }
  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const originalText = custom.trim();
    if (!normalize(originalText)) {
      setMessage("先写几个字，再把它贴上去。");
      return;
    }
    if (selected.some((s) => normalize(s.label) === normalize(originalText))) {
      setMessage("这张纸签已经贴上了。");
      return;
    }
    const result = await interpreter.interpret(originalText);
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([
      ...selected,
      {
        id,
        label: originalText,
        tagIds: result.mappedTagIds,
        custom: { ...result, id, source: "custom" },
      },
    ]);
    setCustom("");
    setMessage(
      result.confidence
        ? `已贴上「${originalText}」。它会给偶然一点偏向。`
        : `已保留「${originalText}」。暂时没读懂这条线索，这次多留一点给偶然。`,
    );
  }
  const customForm = (
    <form onSubmit={addCustom} className="custom-line">
      <label htmlFor={expanded ? "custom-dialog" : "custom-main"}>
        没找到？写下你自己的。
      </label>
      <div>
        <input
          name="custom-tag"
          id={expanded ? "custom-dialog" : "custom-main"}
          value={custom}
          maxLength={60}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="比如「像凌晨三点的便利店」"
          autoComplete="off"
        />
        <button aria-label="贴上自己的纸签" type="submit">
          <ArrowRight size={18} />
        </button>
      </div>
    </form>
  );
  const chip = (id: string) => {
    const active = selected.some((s) => s.id === id);
    return (
      <button
        key={id}
        aria-pressed={active}
        className={"paper-tag " + (active ? "selected" : "")}
        onClick={() => toggle(id)}
      >
        {id === "锋利" ? "想读点锋利的" : id}
        <span aria-hidden="true">{active ? <Check size={12} /> : "+"}</span>
      </button>
    );
  };
  const filtered = tags.filter((t) =>
    query
      ? normalize(t.label + " " + (t.aliases ?? []).join(" ")).includes(
          normalize(query),
        )
      : t.category === category,
  );
  return (
    <section className="picker">
      <div className="section-label">
        <span>01 / 留下线索</span>
        <span>选几张纸签，也可以不选</span>
      </div>
      <h2>此刻的你，想要……</h2>
      <div className="tags">
        {suggested.map(chip)}
        <button className="paper-tag" onClick={onSurprise}>
          随便给我一本 <span>↗</span>
        </button>
      </div>
      <button className="text-button" onClick={() => setExpanded(true)}>
        再加一点偏好 <ArrowUpRight size={16} />
      </button>
      {!expanded && customForm}
      <p className="selection-note" aria-live="polite">
        {message ||
          (selected.length >= 4
            ? `已贴上 ${selected.length} 张。留一点给偶然吧。`
            : selected.length
              ? `已贴上 ${selected.length} 张纸签`
              : "不选也没关系，偶然自有安排。")}
      </p>
      {expanded && (
        <Sheet title="给今晚，多一点线索" onClose={() => setExpanded(false)}>
          <p className="sheet-subtitle">
            不用选全。哪几个词碰到了你，就带走哪几个。
          </p>
          <label className="search-line">
            <Search size={18} />
            <input
              aria-label="搜索纸签"
              name="tag-search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索纸签，比如「梦」"
            />
          </label>
          {customForm}
          <div className="category-tabs" aria-label="标签分类">
            {categories.map((c) => (
              <button
                key={c.id}
                aria-pressed={c.id === category && !query}
                onClick={() => {
                  setCategory(c.id);
                  setQuery("");
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          {category === "personality" && !query && (
            <p className="muted">
              只是给偶然增加一点偏向。不是性格诊断，也不限定你的阅读。
            </p>
          )}
          <div className="tags library-tags">
            {filtered.map((t) => chip(t.id))}
          </div>
          {!filtered.length && (
            <p className="empty">没有找到这张纸签。可以在上面写下自己的。</p>
          )}
          <p className="selection-note" aria-live="polite">
            {message}
          </p>
          <div className="sheet-foot">
            <span>
              已选 {selected.length} 张
              {selected.length >= 4 ? " · 留一点给偶然吧。" : ""}
            </span>
            <button className="primary" onClick={() => setExpanded(false)}>
              贴好了
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
