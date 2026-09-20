import { tags } from "../../data/tags";
import { books } from "../../data/books";
import type { UserTag } from "../../data/types";
export type InterpretedTag = Omit<UserTag, "id" | "source">;
export interface TagInterpreter {
  interpret(text: string): Promise<InterpretedTag>;
}
export function normalize(text: string) {
  return text
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, "");
}
function similarity(a: string, b: string) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) =>
    new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const x = grams(a),
    y = grams(b);
  return (2 * [...x].filter((g) => y.has(g)).length) / (x.size + y.size);
}
export class LocalTagInterpreter implements TagInterpreter {
  async interpret(originalText: string): Promise<InterpretedTag> {
    const normalizedText = normalize(originalText);
    if (!normalizedText)
      return { originalText, normalizedText, mappedTagIds: [], confidence: 0 };
    const negative = /不(?:要|想|是)?(?:太)?(?:治愈|安慰|温柔)/.test(
      normalizedText,
    );
    const matches = tags
      .map((tag) => {
        let score = 0;
        for (const variant of [tag.label, ...(tag.aliases ?? [])]) {
          const n = normalize(variant);
          const position = normalizedText.indexOf(n);
          const negated =
            position >= 0 &&
            /不(?:要|想|是)?$/.test(normalizedText.slice(0, position));
          if (!negated) {
            if (n === normalizedText) score = 1;
            else if (n.length > 1 && position >= 0)
              score = Math.max(score, 0.85);
            else if (similarity(n, normalizedText) > 0.62)
              score = Math.max(score, 0.6);
          }
        }
        if (negative && ["想被安慰", "温柔", "想要一点温柔"].includes(tag.id))
          score = 0;
        return { id: tag.id, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (normalizedText.includes("阴湿"))
      matches.push(
        { id: "潮湿", score: 0.85 },
        { id: "雨夜", score: 0.75 },
        { id: "清冷", score: 0.65 },
      );
    if (!matches.length) {
      for (const book of books) {
        const hit = book.semanticTags.some(
          (t) => similarity(normalize(t), normalizedText) > 0.65,
        );
        if (hit)
          book.tags
            .slice(0, 2)
            .forEach((id) => matches.push({ id, score: 0.45 }));
      }
    }
    return {
      originalText,
      normalizedText,
      mappedTagIds: [...new Set(matches.map((x) => x.id))].slice(0, 5),
      confidence: matches.length ? Math.max(...matches.map((x) => x.score)) : 0,
    };
  }
}
// An explicit opt-in adapter: local interpretation is always available if remote enrichment fails.
export class RemoteTagInterpreter implements TagInterpreter {
  constructor(
    private endpoint: string,
    private fallback: TagInterpreter = new LocalTagInterpreter(),
  ) {}
  async interpret(text: string) {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      if (!Array.isArray(data.mappedTagIds))
        throw new Error("invalid response");
      const valid = new Set(tags.map((t) => t.id));
      return {
        originalText: text,
        normalizedText: normalize(text),
        mappedTagIds: data.mappedTagIds
          .filter(
            (x: unknown): x is string => typeof x === "string" && valid.has(x),
          )
          .slice(0, 5),
        confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0)),
      };
    } catch {
      return this.fallback.interpret(text);
    }
  }
}
