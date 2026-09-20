import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.route(/googleapis.com\/books|openlibrary.org\/search.json/, (r) =>
  r.abort(),
);
await page.goto("http://127.0.0.1:5173/");
await page.getByRole("button", { name: "再加一点偏好" }).tap();
await page.getByRole("button", { name: "关闭", exact: true }).tap();
const input = page.getByPlaceholder("比如「像凌晨三点的便利店」");
await input.fill("qzxv7733");
await input.press("Enter");
await page.getByRole("button", { name: "揭下纸签 qzxv7733" }).waitFor();
for (const name of [
  "想安静一下",
  "想离开现实",
  "想被安慰",
  "想看点奇怪的",
  "想认真想点东西",
])
  await page.getByRole("button", { name, exact: false }).first().tap();
if ((await page.locator(".attached-tags button").count()) !== 6)
  throw new Error("6 tags missing");
const pull = page.getByRole("button", { name: "向右拖开纸带，也可按回车拆开" });
await pull.scrollIntoViewIfNeeded();
const r = await pull.boundingBox();
const cdp = await context.newCDPSession(page);
const x = r.x + 10,
  y = r.y + 22;
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x, y }],
});
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchMove",
  touchPoints: [{ x: x + 25, y }],
});
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchCancel",
  touchPoints: [],
});
await page.waitForTimeout(400);
if (await page.locator(".result").count()) throw new Error("cancel opened");
const r2 = await pull.boundingBox();
const xx = r2.x + 10,
  yy = r2.y + 22;
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: xx, y: yy }],
});
for (let d = 10; d <= 60; d += 10)
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: xx + d, y: yy }],
  });
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchEnd",
  touchPoints: [],
});
await page.waitForTimeout(500);
await page.screenshot({ path: "artifacts/touch-opening.png" });
await page.locator(".result h1").waitFor();
await page.screenshot({ path: "artifacts/touch-result.png" });
console.log(
  "PASS: real mobile touch, 6 clues, unknown custom tag, touch cancellation, successful full-motion reveal.",
);
const broken = await browser.newContext({
  viewport: { width: 768, height: 1024 },
  reducedMotion: "reduce",
});
await broken.addInitScript(() => {
  Object.defineProperty(window, "localStorage", {
    get() {
      throw new Error("storage disabled");
    },
  });
});
const bp = await broken.newPage();
await bp.route(/googleapis.com\/books|openlibrary.org\/search.json/, (r) =>
  r.abort(),
);
await bp.goto("http://127.0.0.1:5173/");
await bp.getByRole("button", { name: "拆开这盒书", exact: false }).dblclick();
await bp.locator(".result h1").waitFor();
await bp.getByRole("button", { name: "收进书架", exact: true }).first().click();
await bp.getByText("浏览器暂时无法保存记录。", { exact: false }).waitFor();
console.log("PASS: storage disabled and rapid clicks.");
const live = await browser.newContext({ reducedMotion: "reduce" });
const lp = await live.newPage();
const responses = [];
lp.on("response", (r) => {
  if (/googleapis.com\/books|openlibrary.org\/search.json/.test(r.url()))
    responses.push({ provider: r.url().split("/")[2], status: r.status() });
});
await lp.goto("http://127.0.0.1:5173/");
await lp.getByRole("button", { name: "拆开这盒书", exact: false }).click();
await lp.locator(".result h1").waitFor();
await lp.waitForTimeout(5000);
console.log(
  "Actual provider network:",
  responses,
  "UI:",
  await lp.locator(".availability [role=status]").textContent(),
);
await browser.close();
