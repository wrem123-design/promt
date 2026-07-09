import fs from "fs";

const path = new URL("../data/settings.json", import.meta.url);
const settings = JSON.parse(fs.readFileSync(path, "utf8"));
const marker = "titleSummary as one short Korean comma-separated title.";
const idx = settings.promptInstruction.indexOf(marker);
if (idx < 0) {
  console.error("marker not found");
  process.exit(1);
}
const start = settings.promptInstruction.lastIndexOf("\n", idx);
const endMarker = "\n\nTag rules:";
const end = settings.promptInstruction.indexOf(endMarker, idx);
if (end < 0) {
  console.error("end marker not found");
  process.exit(1);
}
const before = settings.promptInstruction.slice(0, start + 1);
const after = settings.promptInstruction.slice(end);
const neu = `- Write titleSummary in Korean only as one natural one-line album title that summarizes what the image looks like.
- Prefer one short Korean sentence or phrase (about 20-48 characters, max 60).
- Include the most distinctive outfit, place/background, pose or camera framing, and mood.
- Do not chop English prompt words. Do not use the original filename, hash, extension, upload id, or image source.
- Examples:
  "캐리어 끄는 도시 거리 캐주얼 전신 스냅"
  "하늘색 플리츠 크롭탑 실내 패션 상반신"`;
settings.promptInstruction = `${before}${neu}${after}`;
fs.writeFileSync(path, JSON.stringify(settings, null, 2));
console.log("UPDATED settings titleSummary rules");
