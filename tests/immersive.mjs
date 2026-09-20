import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
await mkdir("artifacts", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const requested = [];
await page.route("https://openlibrary.org/search.json?*", (r) => {
  requested.push(r.request().url());
  return r.fulfill({
    json: {
      docs: Array.from({ length: 20 }, (_, i) => ({
        key: `/works/OL${5000 + i}W`,
        title: `A title ${i}`,
        author_name: ["测试作者"],
        subject: ["fiction"],
        editions: { docs: [{ title: `远山手记 ${i}`, language: ["chi"] }] },
      })),
    },
  });
});
await page.route("https://openlibrary.org/works/*.json", (r) =>
  r.fulfill({
    json: { description: "来自外部作品记录的简介，用于验证翻页和来源显示。" },
  }),
);
await page.route("https://www.googleapis.com/books/*", (r) =>
  r.fulfill({ status: 429, json: {} }),
);
await page.goto("http://127.0.0.1:5173/");
await page.locator(".clue-card").first().waitFor();
if (await page.getByRole("button", { name: "搜索外部书库" }).count())
  throw Error("manual search remains");
for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
]) {
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: `artifacts/immersive-${width}.png` });
  if (
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight,
    )
  )
    throw Error("scene overflow " + width);
}
await page.getByRole("button", { name: "留下 有点累", exact: true }).click();
await page.getByRole("button", { name: "其他纸签" }).click();
await page.getByRole("textbox", { name: "写下自己的纸签" }).fill("阴湿");
await page.getByRole("button", { name: "留下自己的纸签" }).click();
await page.getByRole("button", { name: "好了" }).click();
await page.getByRole("button", { name: "就这些" }).click();
await page.getByRole("button", { name: "拆开", exact: true }).waitFor();
await page.waitForTimeout(300);
const pull = page.getByRole("button", { name: "向右拉开纸带" });
let b = await pull.boundingBox();
await page.mouse.move(b.x + 10, b.y + 20);
await page.mouse.down();
await page.mouse.move(b.x + 30, b.y + 20);
await page.mouse.up();
await page.waitForTimeout(600);
if (await page.locator(".reading-scene").count()) throw Error("abort opened");
await page.screenshot({ path: "artifacts/immersive-parcel.png" });
await page.getByRole("button", { name: "拆开", exact: true }).click();
await page.locator(".reading-scene").waitFor();
await page.getByRole("button", { name: "翻开", exact: true }).click();
await page
  .getByText("来自外部作品记录的简介，用于验证翻页和来源显示。")
  .waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: "artifacts/immersive-reading.png" });
await page.getByRole("button", { name: "留下", exact: true }).click();
await page.getByRole("button", { name: "再抽", exact: true }).click();
await page.getByRole("button", { name: "拆开", exact: true }).click();
await page.locator(".reading-scene").waitFor();
const snapshots = await page.evaluate(() => ({
  cache: localStorage.getItem("between-pages:catalog:v1"),
  history: localStorage.getItem("between-pages:history:v1"),
}));
const history = JSON.parse(snapshots.history);
if (
  history.length !== 2 ||
  history[0].bookId === history[1].bookId ||
  !history.every((h) => h.bookId.startsWith("ol-"))
)
  throw Error("remote repeat/history");
await page.reload();
await page.getByRole("button", { name: "留下的书" }).click();
await page.locator(".archive-list button").first().click();
await page.locator(".reading-scene").waitFor();
await page.waitForTimeout(500);
const axe = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  .analyze();
console.log(
  "reading axe",
  axe.violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => ({target:n.target, summary:n.failureSummary})),
  })),
);
if (axe.violations.length) throw Error("accessibility violations");
const offline = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
await offline.addInitScript(
  (cache) => localStorage.setItem("between-pages:catalog:v1", cache),
  snapshots.cache,
);
const op = await offline.newPage();
await op.route(/openlibrary.org|googleapis.com/, (r) => r.abort());
await op.goto("http://127.0.0.1:5173/");
await op.getByRole("button", { name: "随意", exact: true }).click();
await op.getByRole("button", { name: "拆开", exact: true }).click();
await op.getByText("离线书目", { exact: true }).waitFor();
const empty = await browser.newContext({ reducedMotion: "reduce" });
const ep = await empty.newPage();
await ep.route(/openlibrary.org|googleapis.com/, (r) => r.abort());
await ep.goto("http://127.0.0.1:5173/");
await ep.getByRole("button", { name: "随意", exact: true }).click();
await ep.getByRole("button", { name: "重试", exact: true }).waitFor();
if (await ep.locator(".reading-scene").count())
  throw Error("silently used local dataset");
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS: three viewports, clues/custom, automatic external draw, cancel, reading, favorites, no-repeat, remote cache and cold offline failure.",
  requested.length,
  "requests",
);
const live = await browser.newContext();
const lp = await live.newPage();
await lp.goto("http://127.0.0.1:5173/");
await lp.getByRole("button", { name: "随意", exact: true }).click();
await lp.waitForTimeout(15000);
const status = await lp
  .locator(".parcel-scene-new .gesture-hint")
  .textContent();
console.log("LIVE STATUS", status);
if (
  !(await lp
    .getByRole("button", { name: "拆开", exact: true })
    .isDisabled()
    .catch(() => true))
) {
  await lp.getByRole("button", { name: "拆开", exact: true }).click();
  await lp.locator(".reading-scene").waitFor();
  console.log("LIVE BOOK", await lp.locator(".cover-title").textContent());
  await lp.screenshot({ path: "artifacts/immersive-live.png" });
}
await browser.close();
