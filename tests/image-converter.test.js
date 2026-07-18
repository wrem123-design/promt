const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const converter = require("../image-converter.js");
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function uint32Be(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function uint32Le(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function pngChunk(type, data) {
  return Buffer.concat([uint32Be(data.length), Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}

function makePngWithText(source, text, exif = null) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = [pngChunk("tEXt", Buffer.concat([Buffer.from(source, "latin1"), Buffer.from([0]), Buffer.from(text, "latin1")]))];
  if (exif) chunks.push(pngChunk("eXIf", Buffer.from(exif)));
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([signature, ...chunks]);
}

function webpChunk(type, data) {
  const padding = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(type, "ascii"), uint32Le(data.length), data, padding]);
}

function makeMinimalWebp() {
  const payload = Buffer.concat([Buffer.from("WEBP", "ascii"), webpChunk("VP8 ", Buffer.from([1, 2, 3, 4]))]);
  return Buffer.concat([Buffer.from("RIFF", "ascii"), uint32Le(payload.length), payload]);
}

test("PNG prompt metadata is embedded in WebP EXIF and XMP chunks", async () => {
  const prompt = JSON.stringify({ prompt: { "1": { inputs: { text: "adult portrait prompt" } } } });
  const png = makePngWithText("prompt", prompt);
  const result = await converter.preservePngMetadataInWebp(makeMinimalWebp(), png, 640, 480);
  const chunks = converter.parseWebpChunks(result.bytes);

  assert.equal(result.metadataEntryCount, 1);
  assert.equal(result.hasExif, true);
  assert.equal(result.hasXmp, true);
  assert.equal(chunks[0].type, "VP8X");
  const exif = chunks.find((chunk) => chunk.type === "EXIF");
  assert.ok(exif);
  const exifIfdOffset = Buffer.from(exif.data).readUInt32LE(18);
  const commentSize = Buffer.from(exif.data).readUInt32LE(exifIfdOffset + 6);
  const commentOffset = Buffer.from(exif.data).readUInt32LE(exifIfdOffset + 10);
  const comment = exif.data.slice(commentOffset, commentOffset + commentSize);
  assert.equal(new TextDecoder("latin1").decode(comment.slice(0, 7)), "UNICODE");
  const commentText = new TextDecoder("utf-16be").decode(comment.slice(8, -2));
  assert.deepEqual(JSON.parse(commentText).entries, [{ source: "prompt", text: prompt }]);
  const xmp = chunks.find((chunk) => chunk.type === "XMP ");
  const payload = JSON.parse(new TextDecoder().decode(xmp.data));
  assert.equal(payload.format, "prompt-archive-png-metadata");
  assert.deepEqual(payload.entries, [{ source: "prompt", text: prompt }]);
  assert.equal(chunks[0].data[0] & 0x0c, 0x0c, "VP8X must advertise EXIF and XMP");
  assert.deepEqual([...chunks[0].data.slice(4, 7)], [0x7f, 0x02, 0x00]);
  assert.deepEqual([...chunks[0].data.slice(7, 10)], [0xdf, 0x01, 0x00]);
});

test("an existing PNG eXIf chunk is copied without modification", async () => {
  const originalExif = Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0]);
  const png = makePngWithText("workflow", "{\"nodes\":[]}", originalExif);
  const result = await converter.preservePngMetadataInWebp(makeMinimalWebp(), png, 32, 24);
  const exif = converter.parseWebpChunks(result.bytes).find((chunk) => chunk.type === "EXIF");

  assert.deepEqual(Buffer.from(exif.data), originalExif);
});

test("PNG without textual or EXIF metadata keeps the encoded WebP unchanged", async () => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([signature, pngChunk("IEND", Buffer.alloc(0))]);
  const webp = makeMinimalWebp();
  const result = await converter.preservePngMetadataInWebp(webp, png, 8, 8);

  assert.deepEqual(Buffer.from(result.bytes), webp);
  assert.equal(result.hasExif, false);
  assert.equal(result.hasXmp, false);
});

test("conversion history keeps only the two most recent completed runs", () => {
  const match = appSource.match(/function normalizeConverterHistory\(value\) \{[\s\S]*?\n  \}/);
  assert.ok(match, "normalizeConverterHistory must exist");
  const normalizeConverterHistory = Function(`"use strict"; return (${match[0]});`)();
  const history = normalizeConverterHistory([
    { id: "old", finishedAt: 10, destination: "old", total: 5, converted: 5 },
    { id: "new", finishedAt: 30, destination: "new", total: 8, converted: 7, errors: 1 },
    { id: "middle", finishedAt: 20, destination: "middle", total: 4, converted: 4 },
  ]);

  assert.deepEqual(history.map((entry) => entry.id), ["new", "middle"]);
  assert.equal(history[0].converted, 7);
  assert.match(appSource, /promptArchiveConverterHistory\.v1/);
  assert.match(appSource, /최근 2회/);
});

test("converter supports individual PNG selection, reset, and background progress", () => {
  assert.match(appSource, /name="converterSourceMode" value="files"/);
  assert.match(appSource, /id="converterFileInput"[^>]*multiple/);
  assert.match(appSource, /data-converter-dropzone/);
  assert.match(appSource, /data-action="resetConverterSelection"/);
  assert.match(appSource, /function renderConverterMiniProgress\(\)/);
  assert.match(appSource, /data-converter-mini-title/);
  assert.doesNotMatch(appSource, /변환이 끝날 때까지 창을 닫을 수 없습니다/);
});

test("original PNG deletion is opt-in and runs only after successful output writing", async () => {
  assert.match(appSource, /id="converterDeleteOriginals"/);
  assert.match(appSource, /휴지통으로 이동하지 않으며 복구할 수 없습니다/);
  assert.match(appSource, /converterState\.deleteOriginals = false/);

  const writeIndex = appSource.indexOf("await writeConverterOutput(outputHandle, converted.blob)");
  const queueIndex = appSource.indexOf("deleteQueue.push({ entry, relativeName })");
  const deleteLoopIndex = appSource.indexOf("await permanentlyDeleteConvertedPng(entry)");
  assert.ok(writeIndex >= 0 && queueIndex > writeIndex, "deletion must be queued only after output write succeeds");
  assert.ok(deleteLoopIndex > queueIndex, "queued originals must be deleted after conversion processing");

  const match = appSource.match(/async function permanentlyDeleteConvertedPng\(entry\) \{[\s\S]*?\n  \}/);
  assert.ok(match, "permanentlyDeleteConvertedPng must exist");
  const permanentlyDeleteConvertedPng = Function(`"use strict"; return (${match[0]});`)();
  const removed = [];
  await permanentlyDeleteConvertedPng({ name: "source.png", parentHandle: { removeEntry: async (name) => removed.push(name) } });
  assert.deepEqual(removed, ["source.png"]);
});
