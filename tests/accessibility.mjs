import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
await page.route(/googleapis.com\/books|openlibrary.org\/search.json/, (r) =>
  r.abort(),
);
await page.goto("http://127.0.0.1:5173/");
for (const phase of ["home", "tags", "result"]) {
  if (phase === "tags")
    await page.getByRole("button", { name: "再加一点偏好" }).click();
  if (phase === "result") {
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page
      .getByRole("button", { name: "拆开这盒书", exact: false })
      .click();
    await page.locator(".result h1").waitFor();
  }
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  console.log(
    phase,
    JSON.stringify(
      r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          selector: n.target,
          summary: n.failureSummary,
        })),
      })),
      null,
      2,
    ),
  );
}
await page.screenshot({
  path: "artifacts/result-final-desktop.png",
  fullPage: true,
});
await page.getByRole("button", { name: "再开一盒", exact: false }).click();
await page.getByRole("button", { name: "拆开这盒书", exact: false }).waitFor();
await page.screenshot({
  path: "artifacts/home-final-desktop.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "artifacts/home-final-mobile.png",
  fullPage: true,
});
console.log(
  "WebMCP available:",
  await page.evaluate(() => !!document.modelContext),
);
await browser.close();
