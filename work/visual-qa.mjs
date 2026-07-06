import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/sy.lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.js");
const { chromium } = require("playwright");

const evidenceDir = "C:/Users/sy.lee/Documents/Codex/2026-07-06/codex/.superloopy/evidence/frontend/20260706-165023-prompt-archive";
fs.mkdirSync(evidenceDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const results = [];

async function login(page) {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.fill("#adminPassword", "archive-admin");
  await page.click("button[type='submit']");
  await page.waitForSelector(".gallery-grid, .empty-state");
}

async function snapshot(width, name) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await login(page);
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const horizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  results.push({ width, name, screenshotPath, horizontalScroll });
  await page.close();
}

await snapshot(390, "qa-390-gallery");
await snapshot(768, "qa-768-gallery");
await snapshot(1280, "qa-1280-gallery");

const uploadPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await login(uploadPage);
await uploadPage.click("[data-action='upload']");
await uploadPage.waitForSelector("#uploadCustomInstruction");
const uploadPath = path.join(evidenceDir, "qa-1280-upload-options.png");
await uploadPage.screenshot({ path: uploadPath, fullPage: true });
results.push({
  width: 1280,
  name: "upload-options",
  screenshotPath: uploadPath,
  horizontalScroll: await uploadPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
});
const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARLJgwiAFOwMAU8oH+6n2J80AAAAASUVORK5CYII=",
  "base64",
);
await uploadPage.setInputFiles("#fileInput", {
  name: "qa-upload.png",
  mimeType: "image/png",
  buffer: pngBuffer,
});
await uploadPage.waitForSelector(".queue-item");
const uploadQueuePath = path.join(evidenceDir, "qa-1280-upload-queue.png");
await uploadPage.screenshot({ path: uploadQueuePath, fullPage: true });
results.push({
  width: 1280,
  name: "upload-queue",
  screenshotPath: uploadQueuePath,
  horizontalScroll: await uploadPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
});
await uploadPage.close();

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("dialog", (dialog) => dialog.accept());
await login(page);
await page.click(".image-card");
await page.waitForSelector(".prompt-panel");
if (await page.locator(".sentence").count() === 0) {
  await page.click("[data-action='analyzeOne']");
  await page.waitForSelector(".sentence");
}
await page.click("[data-action='toggleEdit']");
await page.waitForSelector(".sentence[contenteditable='true']");
await page.hover(".sentence[data-sentence-id='appearance-1'][data-lang='en']");
const detailPath = path.join(evidenceDir, "qa-1280-detail-edit.png");
await page.screenshot({ path: detailPath, fullPage: true });
results.push({
  width: 1280,
  name: "detail-edit",
  screenshotPath: detailPath,
  horizontalScroll: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
});

await page.click("[data-action='settings']");
await page.waitForSelector("[data-settings-tab='prompt']");
await page.click("[data-settings-tab='prompt']");
await page.waitForSelector("#promptInstruction");
await page.click("[data-settings-tab='category']");
await page.waitForSelector("#newExcludeOption");
await page.click("[data-settings-tab='theme']");
await page.click("[data-theme='dark-studio']");
await page.waitForTimeout(200);
const settingsPath = path.join(evidenceDir, "qa-1280-settings-dark.png");
await page.screenshot({ path: settingsPath, fullPage: true });
results.push({
  width: 1280,
  name: "settings-dark",
  screenshotPath: settingsPath,
  horizontalScroll: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
});

await browser.close();
console.log(JSON.stringify(results, null, 2));
