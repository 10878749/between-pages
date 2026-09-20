import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/");
await page.getByText("本时段还可拆", { exact: false }).waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: "artifacts/quota-clues.png" });
await page.getByRole("button", { name: "随意", exact: true }).click();
await page.getByRole("button", { name: "拆开", exact: true }).click();
await page.locator(".reading-scene").waitFor({ timeout: 45000 });
await page.waitForTimeout(600);
console.log("LIVE BOOK", await page.locator(".cover-title").textContent());
let q = await page.evaluate(() => fetch("/api/session").then((r) => r.json()));
if (q.quota.remaining !== 1) throw Error("first debit");
await page.reload();
await page.locator(".reading-scene").waitFor();
q = await page.evaluate(() => fetch("/api/session").then((r) => r.json()));
if (q.quota.remaining !== 1) throw Error("reload debit");
await page.getByRole("button", { name: "翻开", exact: true }).click();
await page.getByText("介绍补全尚未启用。已有书目信息仍可查看。").waitFor();
await page.getByRole("button", { name: "留下", exact: true }).click();
await page.getByRole("button", { name: "再抽", exact: true }).click();
await page.getByRole("button", { name: "拆开", exact: true }).click();
await page.locator(".reading-scene").waitFor({ timeout: 45000 });
await page.getByText("本时段已拆完", { exact: true }).waitFor();
if (
  !(await page.getByRole("button", { name: "再抽", exact: true }).isDisabled())
)
  throw Error("exhausted action enabled");
const denial = await page.evaluate(async () => {
  const r = await fetch("/api/draw", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Page-Request": "1" },
    body: JSON.stringify({
      id: "12345678-1234-1234-1234-123456789abc",
      clues: [],
    }),
  });
  return r.status;
});
if (denial !== 429) throw Error("server did not limit");
await page.waitForTimeout(600);
await page.screenshot({ path: "artifacts/quota-exhausted.png" });
const axe = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa"])
  .analyze();
if (axe.violations.length)
  throw Error(
    JSON.stringify(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
const second = await context.newPage();
await second.goto("http://127.0.0.1:5173/");
await second.getByText("本时段已拆完", { exact: true }).waitFor();
for (const size of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 667 },
]) {
  const sized = await context.newPage();
  await sized.setViewportSize(size);
  await sized.goto("http://127.0.0.1:5173/");
  await sized.locator(".reading-scene").waitFor();
  await sized.waitForTimeout(600);
  if (
    await sized.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth + 1 ||
        document.documentElement.scrollHeight > innerHeight + 1,
    )
  )
    throw Error("overflow " + JSON.stringify(size));
  await sized.close();
}
const exposed = await context.request.get(
  "http://127.0.0.1:5173/.local-data/state.json",
);
if (exposed.status() === 200) throw Error("private state exposed");
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS: live server draws, debit, replay/refresh recovery, exhausted UI, backend denial, cross-tab identity, AI unconfigured, private state denial and responsive layout.",
);
await browser.close();
