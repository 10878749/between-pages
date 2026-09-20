import type { Book, Selection } from "../../data/types";

// A source record is not yet a reading recommendation. These gates apply to
// both modes and to cached records, before any randomness or model ranking.
export function hasReadingEvidence(book: Book) {
  const summary = book.bookSummary.trim();
  return (
    summary.length >= 60 &&
    !/外部书库暂未|资料不足|介绍待补|暂无简介/.test(summary)
  );
}
export function suitableRecord(book: Book, clues: Selection[]) {
  if (
    !book.id ||
    !book.title ||
    !book.author ||
    /待补|不详|未知/.test(book.author)
  )
    return false;
  const specialist = /教材|教科书|考试|手册|地方志|县志|行业|文献|题记/.test(
    clues.map((c) => c.label).join(" "),
  );
  if (
    !specialist &&
    /教材|教科书|考试|题库|年鉴|[县區区省市]志|地方志|题记|題記|书目|書目|目录学|目錄學|征求意见|操作手册|textbook|gazetteer|examination|technical manual|bibliography/i.test(
      [book.title, ...book.semanticTags].join(" "),
    )
  )
    return false;
  const genres = clues
    .flatMap((c) => c.tagIds)
    .filter((id) => ["散文", "诗歌", "科幻", "推理", "奇幻"].includes(id));
  return !genres.length || genres.some((id) => book.tags.includes(id));
}
