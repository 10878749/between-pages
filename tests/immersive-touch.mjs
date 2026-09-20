import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
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
      ],
    },
  }),
);
await page.route(/openlibrary.org\/works|googleapis.com/, (r) => r.abort());
await page.goto("http://127.0.0.1:5173/");
const cdp = await context.newCDPSession(page);
async function drag(locator, dx, dy, cancel = false) {
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2,
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
await page.waitForTimeout(500);
await drag(
  page.getByRole("button", { name: "留下 有点累", exact: true }),
  0,
  70,
);
await page.getByRole("button", { name: "就这些" }).waitFor();
await page.getByRole("button", { name: "就这些" }).press("Enter");
const pull = page.getByRole("button", { name: "向右拉开纸带" });
await page.getByRole("button", { name: "拆开", exact: true }).waitFor();
await page.waitForTimeout(500);
await drag(pull, 25, 0, true);
await page.waitForTimeout(500);
if (await page.locator(".reading-scene").count()) throw Error("cancel opened");
await drag(pull, 60, 0);
await page.locator(".reading-scene").waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: "artifacts/immersive-touch.png" });
console.log(
  "PASS: real touch clue selection, keyboard continue, touch cancellation, full-motion touch opening.",
);
await browser.close();
