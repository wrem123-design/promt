/**
 * One-shot: rebuild outfit/place tags from prompt sections with improved matching.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const itemsPath = path.join(root, "data", "items.json");
const tagsPath = path.join(root, "data", "tags.json");

function termMatchesPromptText(text, term) {
  const value = String(term || "").toLowerCase().trim();
  if (!value || !text) return false;
  if (/^[a-z0-9][a-z0-9\s/-]{0,20}$/i.test(value) && value.length <= 12) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
  }
  return text.includes(value);
}

function inferTags(source, options) {
  const text = String(source || "").toLowerCase();
  const other = options.find((tag) => tag.name === "기타") || options[options.length - 1];
  const scored = options
    .filter((tag) => tag.enabled !== false && tag.allowAiAssign !== false)
    .filter((tag) => tag.key !== other?.key && tag.name !== "기타")
    .map((tag) => {
      let score = 0;
      const terms = [tag.name, ...(tag.keywords || [])]
        .map((term) => String(term || "").toLowerCase().trim())
        .filter(Boolean);
      terms.forEach((term) => {
        if (termMatchesPromptText(text, term)) score += Math.min(term.length, 24) + (term.includes(" ") ? 4 : 0);
      });
      return { key: tag.key, name: tag.name, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  if (!scored.length) return other ? [other.key] : [];
  return scored.slice(0, 3).map((entry) => entry.key);
}

function sectionText(item, key) {
  return (item.promptJson?.[key]?.sentences || [])
    .map((sentence) => [sentence.en, sentence.ko].filter(Boolean).join(" "))
    .join(" ");
}

function names(keys, options) {
  return keys.map((key) => options.find((tag) => tag.key === key)?.name || key);
}

const tags = JSON.parse(fs.readFileSync(tagsPath, "utf8"));
const raw = fs.readFileSync(itemsPath, "utf8");
const items = JSON.parse(raw);
const backupPath = path.join(root, "data", `items.backup-retag-${Date.now()}.json`);
fs.writeFileSync(backupPath, raw);
console.log(`Backup: ${backupPath}`);

let changed = 0;
for (const item of items) {
  const outfitContext = [sectionText(item, "outfit"), item.title || ""].filter(Boolean).join(" ");
  const placeContext = [sectionText(item, "background"), item.title || ""].filter(Boolean).join(" ");
  const full = [
    sectionText(item, "appearance"),
    sectionText(item, "outfit"),
    sectionText(item, "background"),
    sectionText(item, "expression_pose"),
    sectionText(item, "details"),
    item.finalPrompt || "",
  ].filter(Boolean).join(" ");

  const prevOutfit = JSON.stringify(item.outfitTags || []);
  const prevBg = JSON.stringify(item.backgroundTags || []);
  item.outfitTags = inferTags(outfitContext || full, tags.outfitTagOptions || []);
  item.backgroundTags = inferTags(placeContext || full, tags.backgroundTagOptions || []);
  item.updatedAt = Date.now();
  if (prevOutfit !== JSON.stringify(item.outfitTags) || prevBg !== JSON.stringify(item.backgroundTags)) {
    changed += 1;
    console.log(
      `${item.id}\n  outfit: ${names(JSON.parse(prevOutfit), tags.outfitTagOptions).join(", ")} → ${names(item.outfitTags, tags.outfitTagOptions).join(", ")}\n  place:  ${names(JSON.parse(prevBg), tags.backgroundTagOptions).join(", ")} → ${names(item.backgroundTags, tags.backgroundTagOptions).join(", ")}`
    );
  }
}

fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));
console.log(`\nSaved ${itemsPath}`);
console.log(`Done. changed=${changed}/${items.length}`);
