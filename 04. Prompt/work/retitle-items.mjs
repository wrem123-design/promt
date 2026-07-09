/**
 * One-shot: regenerate Korean one-line album titles for all items.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const itemsPath = path.join(root, "data", "items.json");
const baseUrl = process.env.PROMPT_ARCHIVE_URL || "http://127.0.0.1:5173";
const concurrency = Number(process.env.RETITLE_CONCURRENCY || 2);
const delayMs = Number(process.env.RETITLE_DELAY_MS || 200);

const sectionKeys = ["appearance", "outfit", "background", "expression_pose", "details"];

function sectionText(item, key) {
  const sentences = item.promptJson?.[key]?.sentences || [];
  return sentences
    .map((s) => [s.ko, s.en].filter(Boolean).join(" / "))
    .filter(Boolean)
    .join(" ");
}

function promptBlob(item) {
  return sectionKeys
    .map((key) => {
      const text = sectionText(item, key);
      return text ? `${key}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function placeTags(item) {
  // items store tag keys; titles API accepts display names or keys as hints
  const tags = Array.isArray(item.backgroundTags) ? item.backgroundTags : [];
  return tags.map((t) => String(t || "").trim()).filter(Boolean).filter((t) => t !== "other_background" && t !== "기타");
}

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server not healthy at ${baseUrl}`);
}

async function requestTitle(item) {
  const sections = {};
  for (const key of sectionKeys) {
    const text = sectionText(item, key);
    if (text) sections[key] = text;
  }
  const place = placeTags(item);
  const res = await fetch(`${baseUrl}/api/title-summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId: item.id,
      promptText: promptBlob(item).slice(0, 6000),
      sections,
      backgroundTags: place,
      placeTags: place,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.ok) {
    throw new Error(payload.message || payload.error || `HTTP ${res.status}`);
  }
  return String(payload.titleSummary || "").trim();
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function main() {
  await waitForHealth();
  const raw = fs.readFileSync(itemsPath, "utf8");
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) throw new Error("items.json is not an array");

  const backupPath = path.join(root, "data", `items.backup-retitle-${Date.now()}.json`);
  fs.writeFileSync(backupPath, raw);
  console.log(`Backup: ${backupPath}`);
  console.log(`Retitling ${items.length} items (concurrency=${concurrency})...`);

  let ok = 0;
  let fail = 0;
  const errors = [];

  await mapPool(items, concurrency, async (item, index) => {
    const prev = item.title || "";
    try {
      if (!item.promptJson) {
        console.log(`[${index + 1}/${items.length}] skip ${item.id} (no prompt)`);
        return;
      }
      const title = await requestTitle(item);
      if (!title) throw new Error("empty title");
      item.title = title;
      item.titleSummary = title;
      item.updatedAt = Date.now();
      ok += 1;
      console.log(`[${index + 1}/${items.length}] OK  ${prev.slice(0, 40)} → ${title}`);
    } catch (error) {
      fail += 1;
      const message = error.message || String(error);
      errors.push({ id: item.id, message });
      console.log(`[${index + 1}/${items.length}] FAIL ${item.id}: ${message}`);
    }
  });

  fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));
  console.log(`\nSaved ${itemsPath}`);
  console.log(`Done. ok=${ok} fail=${fail}`);
  if (errors.length) {
    console.log("Failures:");
    errors.forEach((e) => console.log(`  - ${e.id}: ${e.message}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
