import type { Book, Selection, TagCategory } from "../../data/types";
import { tagById } from "../../data/tags";
const weights: Record<TagCategory, number> = {
  mood: 5,
  emotion: 4,
  readingStyle: 4,
  atmosphere: 3,
  genre: 3,
  topic: 2,
  personality: 0.15,
};
const related: Record<string, string[]> = {
  有点累: ["想被安慰", "安静"],
  心里有点乱: ["安静", "想安静一下"],
  很开心: ["被逗笑", "温柔"],
  很孤独: ["孤独", "想被理解"],
  有点无聊: ["荒诞", "推理"],
  睡不着: ["短篇", "安静"],
  想哭一下: ["可以沉重"],
  想振作: ["找点力量"],
  想发呆: ["诗歌", "自然"],
  想重新开始: ["成长", "找点力量"],
  想被理解: ["孤独", "亲密关系"],
  找点希望: ["找点力量", "温柔"],
  不要答案: ["诗歌", "散文"],
  深夜: ["孤独", "城市夜晚"],
  清晨: ["自然", "日常生活"],
  阳光: ["温柔", "夏夜"],
  月光: ["诗歌", "梦境"],
  雾: ["梦境", "清冷"],
  黄昏: ["记忆", "怀旧"],
  梦核感: ["梦境", "荒诞"],
  想读冷门一点: ["怪谈", "人类学"],
  不想费脑: ["好进入最重要", "散文"],
  思想最重要: ["哲学", "社会学"],
  今天别太虐我: ["温柔", "被逗笑", "自然"],
  温柔: ["想被安慰", "想要一点温柔"],
  想读短一点: ["短篇", "诗歌", "今晚能读完"],
  想看点奇怪的: ["荒诞", "梦境", "奇幻"],
  想离开现实: ["奇幻", "科幻", "旅行"],
  艺术: ["诗歌", "人与空间"],
  历史: ["记忆", "社会观察"],
  传记: ["回忆录"],
  旅行: ["荒野", "岛屿"],
  身份: ["成长", "女性"],
  死亡: ["时间", "可以沉重"],
};
export function matchStrength(book: Book, id: string) {
  if (book.tags.includes(id)) return 1;
  return related[id]?.some((t) => book.tags.includes(t)) ? 0.55 : 0;
}
export function scoreBook(book: Book, selections: Selection[]) {
  return selections.reduce((score, selection, index) => {
    const best = selection.tagIds.reduce(
      (s, id) =>
        Math.max(
          s,
          matchStrength(book, id) *
            weights[tagById.get(id)?.category ?? "topic"],
        ),
      0,
    );
    return (
      score +
      (best / (1 + index * 0.16)) *
        (selection.custom ? Math.max(0.35, selection.custom.confidence) : 1)
    );
  }, 0);
}
