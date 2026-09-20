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

await page.locator('.clue-deck[aria-busy="false"]').waitFor();
await page.waitForTimeout(550);
const card=page.locator('button.clue-card').last();
const name=await card.getAttribute('aria-label');
await card.click();
await page.waitForTimeout(120);
await page.screenshot({path:'artifacts/motion-select-mid.png'});
await page.waitForTimeout(500);
if(await page.locator('.collected button').count()!==1) throw Error('selection missing');
if(await page.getByRole('button',{name,exact:true}).count()) throw Error('selected card still in fan');
if(await page.locator('button.clue-card').count()!==5) throw Error('card duplicated in fan');
await page.screenshot({path:'artifacts/motion-selected.png'});
await page.getByRole('button',{name:'换一手',exact:true}).click();
await page.waitForTimeout(160);
await page.screenshot({path:'artifacts/motion-gather.png'});
await page.locator('.clue-deck[aria-busy="false"]').waitFor();
if(await page.locator('.collected button').count()!==1) throw Error('hand lost selected card');
await page.screenshot({path:'artifacts/motion-new-hand.png'});
await page.getByRole('button',{name:'随手抽书',exact:true}).click();
await page.getByRole('button',{name:'就这些',exact:true}).click();
await page.getByRole('button',{name:'向右拉开纸带'}).waitFor();
while(!releaseDraw) await page.waitForTimeout(20);
releaseDraw();
await page.getByRole('button',{name:'拆开',exact:true}).click();
await page.waitForTimeout(340);
await page.screenshot({path:'artifacts/motion-unwrap.png'});
await page.waitForTimeout(400);
await page.screenshot({path:'artifacts/motion-cover-transfer.png'});
await page.getByRole('button',{name:'翻开 山中来信'}).waitFor();
await page.waitForTimeout(650);
await page.screenshot({path:'artifacts/motion-cover.png'});
if(await page.locator('.parcel-scene-new').count()) throw Error('parcel did not exit');
if(upgrades!==0) throw Error('animation triggered generation');
if(errors.length) throw Error(errors.join('\n'));
await page.emulateMedia({reducedMotion:'reduce'});
await page.getByRole('button',{name:'返回选牌',exact:true}).click();
await page.locator('.clue-deck[aria-busy="false"]').waitFor();
await page.getByRole('button',{name:'换一手',exact:true}).click();
await page.locator('.clue-deck[aria-busy="false"]').waitFor();
await page.locator('.collected button').click();
if(await page.locator('.collected button').count()) await page.waitForTimeout(200);
for(const width of [320,390,430]) {await page.setViewportSize({width,height:740}); if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow '+width);}
console.log('PASS selection transfer, gather/deal, shared cover, reduced motion, widths 320/390/430');
await browser.close();
