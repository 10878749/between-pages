import { it, expect, vi, afterEach } from "vitest";
import { selectBook, candidatePool } from "./selection";
import { books } from "../src/data/books";
afterEach(() => vi.unstubAllGlobals());
const candidate = books[0];
const rank = {
  id: candidate.id,
  score: 85,
  eligible: true,
  reason: "岛上的日常与自然观察适合安静地细读。",
  evidence: [candidate.bookSummary.slice(0, 20)],
  matched: ["安静"],
  mismatches: [],
};
const clues = [{ id: "安静", label: "安静", tagIds: ["安静"] }];
function mock(rankings: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ rankings }) } }],
          }),
        ),
    ),
  );
}
it("selects an actual candidate and retains ranking evidence", async () => {
  mock([rank]);
  const result = await selectBook([candidate], clues, "test", () => 0.5);
  expect(result.book.id).toBe(candidate.id);
  expect(result.matched).toEqual(["安静"]);
  expect(result.rankings[0].evidence).toEqual(rank.evidence);
});
it.each([
  ["unknown id", { id: "invented" }],
  ["invented quote", { evidence: ["不存在的星际战争"] }],
  ["invented clue", { matched: ["不存在的线索"] }],
  ["invalid score", { score: 120 }],
  ["missing evidence", { evidence: [] }],
  ["hard conflict", { eligible: false }],
])("rejects %s", async (_label, changes) => {
  mock([{ ...rank, ...changes }]);
  await expect(selectBook([candidate], clues, "test")).rejects.toThrow();
});
it("does not silently drop or duplicate candidates", async () => {
  mock([rank, rank]);
  await expect(
    selectBook([candidate, books[1]], clues, "test"),
  ).rejects.toThrow("invalid_ranking");
});
it("rejects title-only emotional association even with a high score", async () => {
  mock([
    { ...rank, score: 95, evidence: [candidate.title], reason: "标题隐喻孤独" },
  ]);
  await expect(selectBook([candidate], clues, "test", () => 0)).rejects.toThrow(
    "no_match",
  );
});
it("exploration cannot select a low confidence book", async () => {
  mock([{ ...rank, score: 60, reason: "内容不明，篇幅未知" }]);
  await expect(selectBook([candidate], clues, "test", () => 0)).rejects.toThrow(
    "no_match",
  );
});
it("does not send missing source content to the model", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    selectBook(
      [
        {
          ...candidate,
          title: "并蒂花开：",
          bookSummary: "外部书库暂未提供简介。",
        },
      ],
      clues,
      "test",
    ),
  ).rejects.toThrow("no_candidates");
  expect(fetch).not.toHaveBeenCalled();
});
it("excludes bibliographic records and respects explicit prose selection", () => {
  expect(
    candidatePool([{ ...candidate, title: "藏園羣書題記續集" }], [], []),
  ).toHaveLength(0);
  expect(
    candidatePool(
      [candidate],
      [{ id: "散文", label: "散文", tagIds: ["散文"] }],
      [],
    ),
  ).toHaveLength(0);
});
it("filters specialist manuals unless explicitly requested, and prefers unseen books", () => {
  const manual = { ...candidate, id: "manual", title: "机械工程教材" };
  expect(candidatePool([candidate, manual], [], []).map((b) => b.id)).toEqual([
    candidate.id,
  ]);
  expect(
    candidatePool([manual], [{ id: "manual", label: "教材", tagIds: [] }], []),
  ).toHaveLength(1);
  expect(
    candidatePool(books.slice(0, 3), [], [candidate.id]).some(
      (b) => b.id === candidate.id,
    ),
  ).toBe(false);
});
