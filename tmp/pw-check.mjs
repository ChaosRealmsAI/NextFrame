import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:8765/gallery-16x9-anthropic-warm.html');
await page.waitForTimeout(6000);
await browser.close();
