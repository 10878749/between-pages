import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let releaseDraw;
let latest = null,
  remaining = 2,
  draws = 0,
  upgrades = 0;
const quota = () => ({
  remaining,
  limit: 2,
  resetAt: Date.now() + 3600000,
  serverNow: Date.now(),
});
const book = {
  id: "ol-OL123W",
  title: "山中来信",
  author: "测试作者",
  authorId: "external",
  tags: ["短篇"],
  semanticTags: ["fiction"],
  bookSummary: "外部书库暂未提供简介。可以打开来源页面了解这本书。",
  teaser: "",
  whyNow: "",
  readingNote: "",
  dimensions: {
    introspection: 0,
    dreaminess: 0,
    quietness: 0,
    accessibility: 0,
    aftertaste: 0,
  },
  palette: { paper: "#eeede8", ink: "#542733", accent: "#a57680" },
  source: {
    provider: "Open Library",
    url: "https://openlibrary.org/works/OL123W",
    fetchedAt: new Date().toISOString(),
  },
};
await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const body = route.request().postDataJSON();
  let data = {};
  if (path === "/api/session")
    data = { quota: quota(), latest, aiConfigured: true };
  if (path === "/api/draw") {
    draws++;
    if (draws === 1)
      await new Promise((resolve) => {
        releaseDraw = resolve;
      });
    if (body.mode === "smart") remaining--;
    latest = {
      id: body.id,
      book,
      mode: body.mode,
      unlocked: false,
      cached: false,
      draw: {
        bookId: book.id,
        time: Date.now(),
        selections: body.clues,
        matched: [],
        exploration: true,
        mode: body.mode,
      },
    };
    data = { result: latest, quota: quota() };
  }
  if (path === "/api/details") {
    if (body.upgrade) {
      upgrades++;
      remaining--;
      data = {
        status: "ready",
        quota: quota(),
        details: {
          summary:
            "这是一部以山村生活为背景的短篇小说集。几段相连的故事描写人与人之间的距离，也留意日常的小事。",
          authorBio: "作者资料待考。",
          why: "你选择了安静，缓慢的叙述给细小的日常留下了空间。",
          readingNote: "先读一个短篇，留意人物之间的对话。",
          sources: [],
        },
      };
    } else data = { status: "locked" };
  }
  await route.fulfill({ json: data });
});
await page.route(/https:\/\/(openlibrary|www.googleapis)/, (r) => r.abort());
await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
await page.goto("http://127.0.0.1:5173/");
await page.getByRole("button", { name: "随手抽书", exact: true }).click();
await page.screenshot({ path: "artifacts/final-clues-phone.png" });
await page.getByRole("button", { name: "随意", exact: true }).click();
const seal = page.getByRole("button", { name: "向右拉开纸带" });
await seal.waitFor();
await page.waitForTimeout(400);
const cdp = await context.newCDPSession(page);
async function drag(dx, dy, cancel = false) {
  const b = await seal.boundingBox();
  const x = b.x + b.width * 0.4,
    y = b.y + b.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 6; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
  });
}
if (!(await seal.isDisabled())) throw Error("seal enabled while finding");
await drag(28, 0);
if (await page.locator(".reading-scene").count())
  throw Error("opened before found");
if (draws !== 1) throw Error("did not start finding on entry");
if (await page.locator(".seal-arrow").count())
  throw Error("arrow while searching");
await page.getByRole("button", { name: "纸签", exact: true }).click();
await page.getByRole("button", { name: "查看找书进度" }).waitFor();
releaseDraw();
await page.getByRole("button", { name: "书已备好", exact: true }).waitFor();
await page.locator(".clue-scene").waitFor();
await page.waitForTimeout(350);
if (await page.locator(".parcel-scene-new").count())
  throw Error("background search forced navigation");
await page.getByRole("button", { name: "书已备好", exact: true }).click();
await page.getByText("书已备好", { exact: true }).waitFor();
await page.waitForTimeout(300);
if (await page.locator(".reading-scene").count()) throw Error("auto opened");
await page.getByRole("button", { name: "纸签", exact: true }).click();
await page.getByRole("button", { name: "随意", exact: true }).click();
await page.getByText("书已备好", { exact: true }).waitFor();
if (draws !== 1) throw Error("duplicate preparation on back");
await drag(28, 0, true);
await page.waitForTimeout(500);
if (draws !== 1 || (await page.locator(".reading-scene").count()))
  throw Error("cancel opened");
await drag(5, 50);
await page.waitForTimeout(500);
if (draws !== 1 || (await page.locator(".reading-scene").count()))
  throw Error("vertical opened");
await page.screenshot({ path: "artifacts/final-seal-phone.png" });
await drag(28, 0);
await page.locator(".reading-scene").waitFor();
if (draws !== 1 || remaining !== 2 || upgrades) throw Error("light workflow");
await page.getByRole("button", { name: "翻开", exact: true }).click();
await page.locator(".open-pages").waitFor();
await page.screenshot({ path: "artifacts/final-reading-phone.png" });
await page.getByRole("button", { name: "返回选牌", exact: true }).click();
await page.getByRole("button", { name: "继续看这本书" }).waitFor();
await page.waitForTimeout(1000);
await page.screenshot({ path: "artifacts/final-return-phone.png" });
await page.getByRole("button", { name: "继续看这本书" }).click();
await page.getByRole("button", { name: "翻开", exact: true }).click();
await page
  .getByRole("button", { name: "推敲这本书 · 使用 1 次机会", exact: true })
  .click();
await page.getByText("它与你的线索", { exact: true }).waitFor();
if (remaining !== 1 || upgrades !== 1) throw Error("upgrade quota");
for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(700);
  const bounds = await page.evaluate(() => ({
    book: document.querySelector(".open-pages").getBoundingClientRect().bottom,
    quota: document.querySelector(".quota-notice").getBoundingClientRect().top,
  }));
  if (bounds.book > bounds.quota) throw Error("book overlaps quota");
  await page.screenshot({
    path: `artifacts/final-reading-${viewport.width}.png`,
  });
  const b = await page
    .getByRole("button", { name: "返回选牌", exact: true })
    .boundingBox();
  if (!b || b.y < 0 || b.x < 0) throw Error("home unreachable");
}
await page.setViewportSize({ width: 360, height: 640 });
await page.getByRole("button", { name: "返回选牌", exact: true }).click();
await page.getByRole("button", { name: "继续看这本书" }).waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: "artifacts/final-clues-360.png" });
const continueBounds = await page
  .getByRole("button", { name: "继续看这本书" })
  .boundingBox();
const quotaBounds = await page.locator(".quota-notice").boundingBox();
if (continueBounds.y + continueBounds.height > quotaBounds.y)
  throw Error("resume overlaps quota");
await page.getByRole("button", { name: "推敲选书", exact: true }).click();
await page.getByRole("button", { name: "随意", exact: true }).click();
await page.getByText("书已备好", { exact: true }).waitFor();
if (remaining !== 0 || (await seal.isDisabled()))
  throw Error("last opportunity cannot open");
for (const size of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
]) {
  await page.setViewportSize(size);
  await page.waitForTimeout(400);
  const visual = await page.locator(".parcel-object").boundingBox();
  const title = await page.locator(".ready-title").boundingBox();
  if (Math.abs(visual.x + visual.width / 2 - title.x - title.width / 2) > 1) throw Error("envelope rectangle off center");
  if(title.y - visual.y - visual.height < 12) throw Error("book overlaps ready message");
  const button = await page
    .getByRole("button", { name: "拆开", exact: true })
    .boundingBox();
  const q = await page.locator(".quota-notice").boundingBox();
  if (q.y - button.y - button.height < 31)
    throw Error("tight footer " + JSON.stringify(size));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  if (overflow) throw Error("horizontal overflow " + JSON.stringify(size));
  await page.screenshot({
    path: "artifacts/adaptive-parcel-" + size.width + ".png",
    fullPage: true,
  });
}
await page.addStyleTag({
  content: "p, button {font-size: 2rem !important;}",
});
await page.waitForTimeout(500);
const largeBook=await page.locator(".parcel-object").boundingBox();
const largeTitle=await page.locator(".ready-title").boundingBox();
if(largeTitle.y<largeBook.y+largeBook.height)throw Error("large text overlap");
await page.screenshot({
  path: "artifacts/adaptive-large-text.png",
  fullPage: true,
});
await page.getByRole("button", { name: "拆开", exact: true }).click();
await page.locator(".reading-scene").waitFor();
if (draws !== 2) throw Error("opening made another request");
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS: central-seal touch 28px, cancel/vertical rejection, light flow, upgrade, background return, ready arrow, 5 responsive viewports and enlarged text",
);
await browser.close();
