import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
await p.goto("http://127.0.0.1:5173/");
console.log(await p.title());
console.log(await p.locator("body").innerText());
await b.close();
