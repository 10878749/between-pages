import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("https://openlibrary.org/search.json?*", (r) =>
  r.fulfill({
    json: {
      docs: Array.from({ length: 12 }, (_, i) => ({
        key: `/works/OL${1000 + i}W`,
        title: `书海测试作品 ${i + 1}`,
        author_name: ["测试作者"],
        subject: ["Science fiction"],
        first_publish_year: 2000 + i,
      })),
    },
  }),
);
await page.route("https://openlibrary.org/works/*.json", (r) =>
  r.fulfill({
    json: { description: { value: "这是一段来自外部书库的测试简介。" } },
  }),
);
await page.route("https://www.googleapis.com/books/v1/volumes?*", (r) =>
  r.fulfill({ status: 429, json: { error: { message: "quota" } } }),
);
await page.goto("http://127.0.0.1:5173/");
await page.getByRole("button", { name: "搜索外部书库" }).click();
await page.getByRole("textbox", { name: "搜索书名、作者或主题" }).fill("科幻");
await page.getByRole("button", { name: "搜索", exact: true }).click();
await page.locator(".external-row").first().waitFor();
if ((await page.locator(".external-row").count()) !== 12)
  throw Error("missing results");
await page.getByRole("button", { name: "本页全部加入" }).click();
await page.getByText("本页书目已加入盲盒", { exact: false }).waitFor();
await page.getByRole("button", { name: "下一页", exact: true }).click();
await page.getByText("外部书架 · 第 2 页").waitFor();
await page
  .getByRole("button", { name: "查看详情", exact: true })
  .first()
  .click();
await page.locator(".result h1").waitFor();
await page.getByText("这是一段来自外部书库的测试简介。").waitFor();
if (await page.locator(".attributes").count())
  throw Error("invented editorial attributes");
await page
  .getByRole("button", { name: "收进书架", exact: true })
  .first()
  .click();
await page.reload();
await page.getByText("当前可抽 48 本", { exact: false }).waitFor();
await page.getByRole("button", { name: "我的小书架", exact: true }).click();
await page.locator(".shelf-book").first().click();
await page.locator(".result h1").waitFor();
await page.getByText("这是一段来自外部书库的测试简介。").waitFor();
await page.getByRole("button", { name: "搜索外部书库" }).click();
await page.getByRole("textbox", { name: "搜索书名、作者或主题" }).fill("书海");
await page.getByRole("button", { name: "搜索", exact: true }).click();
await page.locator(".external-row").first().waitFor();
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("mobile overflow");
const axe = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  .analyze();
console.log(
  "Search accessibility:",
  axe.violations.map((v) => v.id),
);
await page.screenshot({ path: "artifacts/search-mobile.png", fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: "artifacts/search-desktop.png", fullPage: true });
if (errors.length) throw Error(errors.join("\n"));
if (axe.violations.length) throw Error("accessibility failures");
console.log(
  "PASS: partial provider failure, pagination, batch import, 48-book catalog, external details, safe missing metadata, favorites, reload, mobile and desktop.",
);
const live = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const lp = await live.newPage();
await lp.goto("http://127.0.0.1:5173/");
await lp.getByRole("button", { name: "搜索外部书库" }).click();
await lp.getByRole("textbox", { name: "搜索书名、作者或主题" }).fill("刘慈欣");
await lp.getByRole("button", { name: "搜索", exact: true }).click();
await lp.waitForTimeout(11000);
console.log(
  "LIVE:",
  await lp.locator(".catalog-status").innerText(),
  "rows:",
  await lp.locator(".external-row").count(),
);
await lp.screenshot({ path: "artifacts/search-live.png", fullPage: true });
await browser.close();
