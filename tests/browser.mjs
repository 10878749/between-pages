import { chromium } from "@playwright/test";
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
await page.route(
  /googleapis.com\/books|openlibrary.org\/search.json/,
  (route) => route.abort(),
);
await page.goto("http://127.0.0.1:5173/");
await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1440, 900],
]) {
  await page.setViewportSize({ width, height });
  await page.screenshot({
    path: `artifacts/home-${width}.png`,
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("overflow " + width);
}
await page
  .getByRole("button", { name: "想安静一下", exact: false })
  .first()
  .click();
await page.getByPlaceholder("比如「像凌晨三点的便利店」").fill("阴湿");
await page.getByPlaceholder("比如「像凌晨三点的便利店」").press("Enter");
await page.getByRole("button", { name: "揭下纸签 阴湿" }).waitFor();
await page.getByRole("button", { name: "再加一点偏好" }).click();
await page.getByRole("textbox", { name: "搜索纸签" }).fill("梦");
if ((await page.locator(".library-tags .paper-tag").count()) < 3)
  throw new Error("alias search failed");
await page.getByRole("button", { name: "梦境", exact: false }).first().click();
await page.getByRole("button", { name: "性格一角" }).click();
if ((await page.locator(".library-tags .paper-tag").count()) !== 16)
  throw new Error("MBTI missing");
await page.getByRole("button", { name: "INFJ", exact: false }).click();
await page.getByRole("button", { name: "贴好了" }).click();
await page.getByRole("button", { name: "揭下纸签 阴湿" }).click();
const pull = page.getByRole("button", { name: "向右拖开纸带，也可按回车拆开" });
const rect = await pull.boundingBox();
await page.mouse.move(rect.x + 20, rect.y + 20);
await page.mouse.down();
await page.mouse.move(rect.x + 50, rect.y + 20, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(450);
if (await page.locator(".result").count()) throw new Error("abort opened box");
const r2 = await pull.boundingBox();
await page.mouse.move(r2.x + 20, r2.y + 20);
await page.mouse.down();
await page.mouse.move(r2.x + 135, r2.y + 20, { steps: 10 });
await page.mouse.up();
await page.locator(".result h1").waitFor();
const first = await page.locator(".result h1").textContent();
await page
  .getByRole("button", { name: "收进书架", exact: true })
  .first()
  .click();
await page
  .getByRole("button", { name: "已收进书架", exact: true })
  .first()
  .waitFor();
await page.screenshot({ path: "artifacts/result-desktop.png", fullPage: true });
for (const [width, height] of [
  [390, 844],
  [768, 1024],
]) {
  await page.setViewportSize({ width, height });
  await page.screenshot({
    path: `artifacts/result-${width}.png`,
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("result overflow");
}
await page.getByRole("button", { name: "再开一盒", exact: false }).click();
await page.getByRole("button", { name: "拆开这盒书", exact: false }).waitFor();
await page.getByRole("button", { name: "什么都不选，直接给我一本" }).click();
await page.locator(".result h1").waitFor();
if ((await page.locator(".result h1").textContent()) === first)
  throw new Error("duplicate");
await page.getByRole("button", { name: "今晚开过的书", exact: true }).click();
if ((await page.locator(".history-list>button").count()) !== 2)
  throw new Error("history missing");
await page.locator(".history-list>button").last().click();
if ((await page.locator(".result h1").textContent()) !== first)
  throw new Error("history restore");
await page.reload();
await page.getByRole("button", { name: "我的小书架", exact: true }).click();
await page.locator(".shelf-book").waitFor();
await page.screenshot({ path: "artifacts/shelf-mobile.png", fullPage: true });
await page.locator(".shelf-book").click();
if ((await page.locator(".result h1").textContent()) !== first)
  throw new Error("favorite persistence");
await page.getByRole("button", { name: "再开一盒", exact: false }).click();
await page.getByRole("button", { name: "拆开这盒书", exact: false }).focus();
await page.keyboard.press("Enter");
await page.locator(".result h1").waitFor();
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "PASS: 3 responsive sizes, alias search, custom tags, MBTI, removal, drag abort/success, history, favorite persistence, zero tags, keyboard, offline provider fallback.",
);
await browser.close();
