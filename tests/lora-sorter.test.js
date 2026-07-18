const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const converter = require("../image-converter.js");
const sorter = require("../lora-sorter.js");

function makeChunk(type, data) {
  const payload = Buffer.from(data);
  const chunk = Buffer.alloc(8 + payload.length + (payload.length % 2));
  chunk.write(type, 0, 4, "ascii");
  chunk.writeUInt32LE(payload.length, 4);
  payload.copy(chunk, 8);
  return chunk;
}

function makeWebp(chunks) {
  const body = Buffer.concat(chunks.map(({ type, data }) => makeChunk(type, data)));
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, 4, "ascii");
  return Buffer.concat([header, body]);
}

function makePng(chunks) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const encoded = chunks.map(({ type, data }) => {
    const payload = Buffer.from(data);
    const chunk = Buffer.alloc(12 + payload.length);
    chunk.writeUInt32BE(payload.length, 0);
    chunk.write(type, 4, 4, "ascii");
    payload.copy(chunk, 8);
    return chunk;
  });
  return Buffer.concat([signature, ...encoded]);
}

function makeJpegWithExif(tiff) {
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), Buffer.from(tiff)]);
  const segment = Buffer.alloc(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), segment, Buffer.from([0xff, 0xd9])]);
}

function makeImageSaverExif(promptGraph) {
  const workflow = Buffer.from(`workflow:${JSON.stringify({ nodes: [] })}\0`, "utf8");
  const prompt = Buffer.from(`prompt:${JSON.stringify(promptGraph)}\0`, "utf8");
  const entryCount = 2;
  const ifdOffset = 8;
  const dataOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const tiff = Buffer.alloc(dataOffset + workflow.length + prompt.length);
  tiff.write("MM", 0, 2, "ascii");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(ifdOffset, 4);
  tiff.writeUInt16BE(entryCount, ifdOffset);

  const writeEntry = (index, tag, value, offset) => {
    const start = ifdOffset + 2 + index * 12;
    tiff.writeUInt16BE(tag, start);
    tiff.writeUInt16BE(2, start + 2);
    tiff.writeUInt32BE(value.length, start + 4);
    tiff.writeUInt32BE(offset, start + 8);
    value.copy(tiff, offset);
  };
  writeEntry(0, 0x010f, workflow, dataOffset);
  writeEntry(1, 0x0110, prompt, dataOffset + workflow.length);
  tiff.writeUInt32BE(0, ifdOffset + 2 + entryCount * 12);
  return tiff;
}

function makeSingleExifTag(tag, type, data, little = true) {
  const payload = Buffer.from(data);
  const ifdOffset = 8;
  const valueOffset = 26;
  const tiff = Buffer.alloc(valueOffset + payload.length);
  tiff.write(little ? "II" : "MM", 0, 2, "ascii");
  little ? tiff.writeUInt16LE(42, 2) : tiff.writeUInt16BE(42, 2);
  little ? tiff.writeUInt32LE(ifdOffset, 4) : tiff.writeUInt32BE(ifdOffset, 4);
  little ? tiff.writeUInt16LE(1, ifdOffset) : tiff.writeUInt16BE(1, ifdOffset);
  const entry = ifdOffset + 2;
  little ? tiff.writeUInt16LE(tag, entry) : tiff.writeUInt16BE(tag, entry);
  little ? tiff.writeUInt16LE(type, entry + 2) : tiff.writeUInt16BE(type, entry + 2);
  little ? tiff.writeUInt32LE(payload.length / (type === 3 ? 2 : 1), entry + 4) : tiff.writeUInt32BE(payload.length / (type === 3 ? 2 : 1), entry + 4);
  little ? tiff.writeUInt32LE(valueOffset, entry + 8) : tiff.writeUInt32BE(valueOffset, entry + 8);
  payload.copy(tiff, valueOffset);
  return tiff;
}

function powerLoraPrompt(overrides = {}) {
  return {
    206: {
      class_type: "LoraLoaderModelOnly",
      inputs: { lora_name: "krea2\\fedor_bypass.safetensors", strength_model: 3 },
    },
    264: {
      class_type: "Power Lora Loader (rgthree)",
      _meta: { title: "Power Lora Loader (rgthree)" },
      inputs: {
        lora_1: { on: false, lora: "krea2\\you.oxx_v1.safetensors", strength: 0.8 },
        lora_2: { on: true, lora: "krea2\\Bohee_v1.safetensors", strength: 0.85 },
        ...overrides,
      },
    },
  };
}

test("finds only enabled entries in Power Lora Loader and ignores other LoRA nodes", () => {
  const result = sorter.findActivePowerLoras([
    { source: "prompt", text: JSON.stringify(powerLoraPrompt()) },
  ]);

  assert.deepEqual(result, [{
    path: "krea2\\Bohee_v1.safetensors",
    name: "Bohee_v1",
    strength: 0.85,
    nodeId: "264",
  }]);
});

test("unwraps converted PNG metadata stored in WebP XMP", () => {
  const payload = {
    format: "prompt-archive-png-metadata",
    version: 1,
    entries: [{ source: "prompt", text: JSON.stringify(powerLoraPrompt()) }],
  };
  const webp = makeWebp([{ type: "VP8 ", data: Buffer.from([0]) }, { type: "XMP ", data: Buffer.from(JSON.stringify(payload)) }]);

  const result = sorter.inspectImageMetadata(webp, "image/webp");

  assert.equal(result.status, "matched");
  assert.deepEqual(result.loras.map((entry) => entry.name), ["Bohee_v1"]);
});

test("reads native ComfyUI Image Saver prompt JSON from WebP EXIF Model", () => {
  const exif = makeImageSaverExif(powerLoraPrompt({
    lora_2: { on: false, lora: "krea2\\Bohee_v1.safetensors", strength: 0.85 },
    lora_3: { on: true, lora: "krea2\\Karina_v1.safetensors", strength: 0.96 },
  }));
  const webp = makeWebp([{ type: "VP8 ", data: Buffer.from([0]) }, { type: "EXIF", data: exif }]);

  const result = sorter.inspectImageMetadata(webp, "image/webp");

  assert.equal(result.status, "matched");
  assert.equal(result.loras[0].path, "krea2\\Karina_v1.safetensors");
});

test("reads ComfyUI prompt metadata from PNG text, PNG EXIF, and JPEG EXIF", () => {
  const graph = powerLoraPrompt();
  const promptText = Buffer.concat([Buffer.from("prompt\0", "latin1"), Buffer.from(JSON.stringify(graph), "latin1")]);
  const pngText = makePng([{ type: "tEXt", data: promptText }, { type: "IEND", data: Buffer.alloc(0) }]);
  const pngExif = makePng([{ type: "eXIf", data: makeImageSaverExif(graph) }, { type: "IEND", data: Buffer.alloc(0) }]);
  const jpeg = makeJpegWithExif(makeImageSaverExif(graph));

  assert.equal(sorter.inspectImageMetadata(pngText, "image/png").loras[0].name, "Bohee_v1");
  assert.equal(sorter.inspectImageMetadata(pngExif, "image/png").loras[0].name, "Bohee_v1");
  assert.equal(sorter.inspectImageMetadata(jpeg, "image/jpeg").loras[0].name, "Bohee_v1");
});

test("reads an uncompressed PNG iTXt prompt and ignores compressed iTXt safely", () => {
  const graph = JSON.stringify(powerLoraPrompt());
  const prefix = Buffer.concat([Buffer.from("prompt\0", "utf8"), Buffer.from([0, 0]), Buffer.from([0, 0])]);
  const plain = makePng([{ type: "iTXt", data: Buffer.concat([prefix, Buffer.from(graph)]) }, { type: "IEND", data: Buffer.alloc(0) }]);
  const compressedPrefix = Buffer.from(prefix);
  compressedPrefix[7] = 1;
  const compressed = makePng([{ type: "iTXt", data: Buffer.concat([compressedPrefix, Buffer.from(graph)]) }, { type: "IEND", data: Buffer.alloc(0) }]);

  assert.equal(sorter.inspectImageMetadata(plain, "image/png").status, "matched");
  assert.equal(sorter.inspectImageMetadata(compressed, "image/png").status, "unreadable");
});

test("reads converted metadata from EXIF UserComment without XMP", () => {
  const payload = JSON.stringify({
    format: "prompt-archive-png-metadata",
    version: 1,
    entries: [{ source: "prompt", text: JSON.stringify(powerLoraPrompt()) }],
  });
  const exif = converter.buildExifUserComment(payload);
  const webp = makeWebp([{ type: "VP8 ", data: Buffer.from([0]) }, { type: "EXIF", data: exif }]);

  assert.equal(sorter.inspectImageMetadata(webp.buffer.slice(webp.byteOffset, webp.byteOffset + webp.byteLength), "").loras[0].name, "Bohee_v1");
});

test("decodes ASCII, raw UTF-8, and little-endian UTF-16 EXIF text values", () => {
  const graph = JSON.stringify(powerLoraPrompt());
  const asciiExif = makeSingleExifTag(0x9286, 7, Buffer.concat([Buffer.from("ASCII\0\0\0", "ascii"), Buffer.from(graph), Buffer.from([0])]));
  const rawExif = makeSingleExifTag(0x9286, 7, Buffer.from(graph, "utf8"));
  const utf16Exif = makeSingleExifTag(0x9c9c, 3, Buffer.from(graph, "utf16le"));

  assert.equal(sorter.inspectMetadataEntries(sorter.extractExifEntries(asciiExif)).status, "matched");
  assert.equal(sorter.inspectMetadataEntries(sorter.extractExifEntries(rawExif)).status, "matched");
  assert.equal(sorter.inspectMetadataEntries(sorter.extractExifEntries(utf16Exif)).status, "matched");
});

test("supports workflow-style node arrays and defaults a missing strength to one", () => {
  const workflow = {
    nodes: [{
      id: 9,
      type: "Power Lora Loader (rgthree)",
      widgets_values: [{ on: true, lora: "krea2/Karina_v1.safetensors" }],
    }],
  };
  const result = sorter.findActivePowerLoras([{ source: "workflow", text: JSON.stringify(workflow) }]);

  assert.deepEqual(result, [{ path: "krea2/Karina_v1.safetensors", name: "Karina_v1", strength: 1, nodeId: "9" }]);
});

test("fails closed on unsupported bytes, malformed image chunks, and non-byte input", () => {
  assert.equal(sorter.inspectImageMetadata(Buffer.from("not an image"), "application/octet-stream").status, "unreadable");
  assert.equal(sorter.inspectImageMetadata(Buffer.from("RIFF\u0004\u0000\u0000\u0000WEBP", "binary"), "image/webp").status, "unreadable");
  const corruptWebp = Buffer.from("RIFF\u0010\u0000\u0000\u0000WEBPEXIF\u00ff\u00ff\u00ff\u007f", "binary");
  assert.match(sorter.inspectImageMetadata(corruptWebp, "image/webp").error, /손상된 WebP/);
  assert.throws(() => sorter.imageMetadataEntries("not bytes"), /바이트 배열/);
});

test("invalid embedded JSON and unknown inspection states remain unreadable", () => {
  assert.equal(sorter.inspectMetadataEntries([{ source: "prompt", text: "prefix {broken json} suffix" }]).status, "unreadable");
  assert.deepEqual(sorter.classificationForInspection({ status: "unexpected", loras: [] }), {
    key: "__unreadable__",
    label: "메타데이터 판독 불가",
    kind: "unreadable",
  });
});

test("caps hostile metadata nesting instead of overflowing the call stack", () => {
  let nested = "{\"on\":true,\"lora\":\"krea2\\\\Bohee_v1.safetensors\"}";
  for (let index = 0; index < 6000; index += 1) nested = `{\"next\":${nested}}`;
  const graph = `{\"1\":{\"class_type\":\"Power Lora Loader (rgthree)\",\"inputs\":${nested}}}`;

  assert.doesNotThrow(() => sorter.findActivePowerLoras([{ source: "prompt", text: graph }]));
});

test("groups multiple enabled LoRAs as one unambiguous combination", () => {
  const inspection = {
    status: "matched",
    loras: [
      { path: "krea2\\Bohee_v1.safetensors", name: "Bohee_v1", strength: 0.8, nodeId: "1" },
      { path: "krea2\\Karina_v1.safetensors", name: "Karina_v1", strength: 0.9, nodeId: "1" },
    ],
  };

  assert.deepEqual(sorter.classificationForInspection(inspection), {
    key: "krea2\\bohee_v1.safetensors+krea2\\karina_v1.safetensors",
    label: "Bohee_v1 + Karina_v1",
    kind: "multiple",
  });
});

test("reports images with no enabled Power LoRA without treating them as errors", () => {
  const result = sorter.inspectMetadataEntries([
    { source: "prompt", text: JSON.stringify(powerLoraPrompt({ lora_2: { on: false, lora: "x.safetensors", strength: 1 } })) },
  ]);

  assert.equal(result.status, "none");
  assert.deepEqual(sorter.classificationForInspection(result), {
    key: "__no_active_lora__",
    label: "활성 Power LoRA 없음",
    kind: "none",
  });
});

test("marks malformed or absent metadata as unreadable", () => {
  assert.equal(sorter.inspectMetadataEntries([{ source: "prompt", text: "not json" }]).status, "unreadable");
  assert.equal(sorter.inspectImageMetadata(makeWebp([{ type: "VP8 ", data: Buffer.from([0]) }]), "image/webp").status, "unreadable");
});

test("creates Windows-safe suggested folder names", () => {
  assert.equal(sorter.safeFolderName("krea2\\Bohee:v1?.safetensors"), "Bohee_v1");
  assert.equal(sorter.safeFolderName("  ...  "), "LoRA_분류");
});

test("normalizes duplicate active LoRA paths case-insensitively", () => {
  const graph = powerLoraPrompt({
    lora_3: { on: true, lora: "KREA2\\BOHEE_V1.SAFETENSORS", strength: 0.9 },
  });
  const result = sorter.findActivePowerLoras([{ source: "prompt", text: JSON.stringify(graph) }]);

  assert.equal(result.length, 1);
  assert.equal(result[0].strength, 0.85);
});

test("exposes image extensions accepted by the folder scanner", () => {
  assert.equal(sorter.isSupportedImageName("a.webp"), true);
  assert.equal(sorter.isSupportedImageName("b.PNG"), true);
  assert.equal(sorter.isSupportedImageName("c.jpg"), true);
  assert.equal(sorter.isSupportedImageName("d.jpeg"), true);
  assert.equal(sorter.isSupportedImageName("notes.txt"), false);
});

test("summarizes scanned files into stable LoRA groups", () => {
  const groups = sorter.groupInspectedFiles([
    { name: "b.webp", classification: { key: "b", label: "Bohee_v1", kind: "single" } },
    { name: "a.webp", classification: { key: "b", label: "Bohee_v1", kind: "single" } },
    { name: "x.webp", classification: { key: "__unreadable__", label: "메타데이터 판독 불가", kind: "unreadable" } },
  ]);

  assert.deepEqual(groups.map(({ key, label, kind, count, movable }) => ({ key, label, kind, count, movable })), [
    { key: "b", label: "Bohee_v1", kind: "single", count: 2, movable: true },
    { key: "__unreadable__", label: "메타데이터 판독 불가", kind: "unreadable", count: 1, movable: false },
  ]);
  assert.deepEqual(groups[0].files.map((entry) => entry.name), ["a.webp", "b.webp"]);
});

test("creates non-destructive collision filenames", () => {
  assert.equal(sorter.collisionFileName("portrait.webp", 0), "portrait.webp");
  assert.equal(sorter.collisionFileName("portrait.webp", 1), "portrait_2.webp");
  assert.equal(sorter.collisionFileName("archive.name.PNG", 2), "archive.name_3.PNG");
  assert.equal(sorter.collisionFileName("no-extension", 1), "no-extension_2");
});

test("converter parser remains available for shared WebP chunk decoding", () => {
  assert.equal(typeof converter.parseWebpChunks, "function");
});

test("app exposes LoRA routing UI and verifies the copy before deleting its source", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const htmlSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.match(htmlSource, /<script src="lora-sorter\.js"><\/script>/);
  assert.match(serverSource, /\["\/lora-sorter\.js", path\.join\(rootDir, "lora-sorter\.js"\)\]/);
  assert.match(appSource, /data-action="loraSorter"/);
  assert.match(appSource, /data-action="selectLoraGroupDestination"/);
  assert.match(appSource, /data-action="toggleLoraGroupExcluded"/);
  assert.match(appSource, /excludedGroupKeys: new Set\(\)/);
  assert.match(appSource, /function renderLoraSorterMiniProgress\(\)/);
  const pickerFunction = appSource.match(/async function selectLoraGroupDestination\(groupKey\) \{[\s\S]*?\n  \}/)?.[0] || "";
  const pickerId = pickerFunction.match(/showDirectoryPicker\(\{ id: "([^"]+)"/)?.[1] || "";
  assert.match(pickerId, /^[A-Za-z0-9_-]+$/);
  assert.ok(pickerId.length <= 32, `picker id must be 32 characters or fewer, got ${pickerId.length}`);
  assert.match(appSource, /entry\.movable && !loraSorterState\.excludedGroupKeys\.has\(entry\.key\)/);
  assert.doesNotMatch(appSource, /id="loraSorterCollisionMode"[\s\S]{0,500}value="overwrite"/);

  const writeIndex = appSource.indexOf("await writeConverterOutput(outputHandle, sourceFile)");
  const verifyIndex = appSource.indexOf("if (outputFile.size !== sourceFile.size)");
  const deleteIndex = appSource.indexOf("await entry.parentHandle.removeEntry(entry.name)");
  assert.ok(writeIndex >= 0 && verifyIndex > writeIndex, "destination must be written before verification");
  assert.ok(deleteIndex > verifyIndex, "source must be deleted only after destination verification");
});
