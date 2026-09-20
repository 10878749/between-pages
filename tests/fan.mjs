import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("https://openlibrary.org/search.json?*", (r) =>
  r.fulfill({
    json: {
      docs: [
        {
          key: "/works/OL123W",
          title: "山中来信",
          author_name: ["作者"],
          subject: ["fiction"],
        },
        {
          key: "/works/OL456W",
          title: "海边手记",
          author_name: ["作者"],
          subject: ["fiction"],
        },
      ],
    },
  }),
);
await page.route(/openlibrary.org\/works|googleapis.com/, (r) => r.abort());
await page.goto("http://127.0.0.1:5173/");
const cdp = await context.newCDPSession(page);
async function drag(locator, dx, dy, cancel = false) {
  const b = await locator.boundingBox();
  const x = b.x + 18,
    y = b.y + 50;
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
await page.waitForTimeout(600);
if ((await page.locator(".clue-card").count()) !== 6)
  throw Error("expected six cards");
await page.screenshot({ path: "artifacts/wine-mobile.png" });
await page
  .getByRole("button", { name: "留下 有点累", exact: true })
  .locator(".clue-label")
  .tap();
await page.getByRole("button", { name: "移除 有点累" }).waitFor();
await page.getByRole("button", { name: "MBTI", exact: true }).tap();
await page
  .getByRole("button", { name: "留下 INTJ", exact: true })
  .locator(".clue-label")
  .tap();
await page.getByRole("button", { name: "换一手", exact: true }).tap();
await page.getByRole("button", { name: "留下 ENFJ", exact: true }).waitFor();
await page.getByRole("button", { name: "移除 有点累" }).waitFor();
const ax = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa"])
  .analyze();
console.log(
  "AXE",
  ax.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
);
if (ax.violations.length) throw Error("axe");
await page.getByRole("button", { name: "就这些" }).tap();
await page.getByRole("button", { name: "拆开", exact: true }).click();
await page.locator(".reading-scene").waitFor();
await page.waitForTimeout(500);
await drag(page.locator(".book-touch"), 30, 0, true);
await page.waitForTimeout(500);
if (await page.locator(".open-pages").count()) throw Error("cancel flipped");
await drag(page.locator(".book-touch"), -90, 0);
await page.locator(".open-pages").waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: "artifacts/wine-reading.png" });
await page.getByRole("button", { name: "合上", exact: true }).tap();
await page.waitForTimeout(400);
await drag(page.locator(".book-touch"), 90, 0);
await page.locator(".parcel-scene-new").waitFor();
if (await page.locator(".open-pages").count())
  throw Error("right swipe clicked");
await page.getByRole("button", { name: "拆开", exact: true }).click();
await page.locator(".reading-scene").waitFor();
for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
]) {
  await page.setViewportSize({ width, height });
  await page.reload();
  await page.waitForTimeout(600);
  if (
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight,
    )
  )
    throw Error("overflow");
  await page.screenshot({ path: `artifacts/wine-${width}.png` });
}
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS: themed six-card fan, MBTI pagination, preserved selection, touch cancel and left/right book swipes, three viewports.",
);
await browser.close();
