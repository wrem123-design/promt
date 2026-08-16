const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const resolver = require("../video-prompt-resolver.js");

const SAMPLE_PROMPT = `subject_definitions:
<Subject 1> is a single female wrestler whose facial identity comes from <Picture 1>.

<Subject 2> is a sold-out professional wrestling arena.

summary:
[reference generation]
A 10-second wrestling entrance clip.

retention_analysis:
<Subject 1>: fully_preserved - preserve the facial identity from <Picture 1>.
<Subject 2>: fully_generated - generate a premium live-broadcast wrestling arena.

detailed_description:
The target video uses a photorealistic live-broadcast wrestling style.

[Shot 1]
A very wide establishing shot shows <Subject 2>.

overall_soundscape:
Huge indoor arena crowd noise and entrance music.

non_diegetic_music:
A bold heroic wrestling entrance theme.`;

test("formats file duration labels without reading the prompt", () => {
  assert.equal(resolver.formatVideoDurationLabel(8), "8s");
  assert.equal(resolver.formatVideoDurationLabel(8.008), "8s");
  assert.equal(resolver.formatVideoDurationLabel(0), "");
});

test("snaps video dimensions to common aspect ratio labels", () => {
  assert.equal(resolver.formatVideoAspectRatioLabel(1920, 1080), "16:9");
  assert.equal(resolver.formatVideoAspectRatioLabel(1080, 1920), "9:16");
  assert.equal(resolver.formatVideoAspectRatioLabel(1440, 1080), "4:3");
  assert.equal(resolver.formatVideoAspectRatioLabel(1080, 1440), "3:4");
  assert.equal(resolver.formatVideoAspectRatioLabel(854, 480), "16:9");
  assert.equal(resolver.formatVideoAspectRatioLabel(360, 480), "3:4");
  assert.equal(resolver.formatVideoAspectRatioLabel(1000, 1000), "1:1");
  assert.equal(resolver.formatVideoAspectRatioLabel(0, 1080), "");
});

test("a later leftover prompt does not overwrite the first six sections", () => {
  const mixed = `${SAMPLE_PROMPT}

subject_definitions:
Wrong leftover character.

overall_soundscape:
Dense nighttime forest ambience with thunderclaps.

non_diegetic_music:
A tense orchestral Japanese anime battle score.`;
  const split = resolver.splitVideoPromptSections(mixed);
  assert.match(split.sections.overall_soundscape, /arena crowd noise/);
  assert.match(split.sections.non_diegetic_music, /heroic wrestling entrance theme/);
  assert.doesNotMatch(split.sections.overall_soundscape, /forest ambience|thunder/);
  assert.doesNotMatch(split.sections.non_diegetic_music, /orchestral Japanese/);
});

test("missing labeled sections stay present but empty", () => {
  const split = resolver.splitVideoPromptSections(`subject_definitions:
One character.

summary:
A short clip.`);
  assert.equal(split.sections.retention_analysis, "");
  assert.equal(split.promptJson.retention_analysis.sentences.length, 0);
  assert.equal(split.promptJson.non_diegetic_music.sentences.length, 0);
  assert.ok(Object.prototype.hasOwnProperty.call(split.promptJson, "detailed_description"));
});

test("splits a labeled MiniMax prompt into the six video sections", () => {
  const split = resolver.splitVideoPromptSections(SAMPLE_PROMPT);
  assert.ok(split);
  assert.equal(resolver.VIDEO_SECTION_KEYS.length, 6);
  assert.match(split.sections.subject_definitions, /female wrestler/);
  assert.match(split.sections.summary, /10-second wrestling entrance/);
  assert.match(split.sections.retention_analysis, /fully_preserved/);
  assert.match(split.sections.detailed_description, /\[Shot 1\]/);
  assert.match(split.sections.overall_soundscape, /arena crowd noise/);
  assert.match(split.sections.non_diegetic_music, /heroic wrestling entrance theme/);
  assert.equal(split.promptJson.summary.sentences[0].id, "summary-1");
  assert.equal(split.promptJson.summary.sentences[0].ko, "");
});

test("extracts MiniMax prompt text from a ComfyUI PROMPT graph", () => {
  const graph = {
    139: {
      inputs: {
        prompt: SAMPLE_PROMPT,
        width: 768,
      },
      class_type: "MiniMaxH3ReferenceToVideo",
    },
    140: {
      inputs: { image: "ref.jpg" },
      class_type: "LoadImage",
    },
  };
  const resolved = resolver.resolveVideoPrompt([
    { source: "PROMPT", text: JSON.stringify(graph) },
  ]);
  assert.ok(resolved);
  assert.match(resolved.promptJson.subject_definitions.sentences[0].en, /female wrestler/);
  assert.equal(resolved.source, "prompt");
});

test("reads QuickTime mdta prompt keys from an MP4-like buffer", () => {
  const payload = JSON.stringify({
    139: {
      inputs: { prompt: SAMPLE_PROMPT },
      class_type: "MiniMaxH3ReferenceToVideo",
    },
  });
  const bytes = makeMp4WithPrompt(payload);
  const resolved = resolver.resolveVideoPromptFromBytes(bytes);
  assert.ok(resolved);
  assert.match(resolved.promptJson.overall_soundscape.sentences[0].en, /arena crowd noise/);
});

test("reads Matroska PROMPT tags from a WebM-like buffer", () => {
  const payload = JSON.stringify({
    139: {
      inputs: { prompt: SAMPLE_PROMPT },
      class_type: "MiniMaxH3ReferenceToVideo",
    },
  });
  const bytes = makeWebmWithPrompt(payload);
  const resolved = resolver.resolveVideoPromptFromBytes(bytes);
  assert.ok(resolved);
  assert.match(resolved.promptJson.non_diegetic_music.sentences[0].en, /heroic wrestling/);
});

const realWebm = "D:\\ComfyUI-Easy-Install\\ComfyUI\\output\\video\\MiniMax_H3_00284-audio.webm";
const realMp4 = "D:\\ComfyUI-Easy-Install\\ComfyUI\\output\\video\\MiniMax_H3_00283_.mp4";

const reportedWebm = "D:\\ComfyUI-Easy-Install\\ComfyUI\\output\\video\\MiniMax_120149_00001-audio.webm";
if (fs.existsSync(reportedWebm)) {
  test("uses the executed MiniMax prompt instead of leftover workflow audio lines", () => {
    const resolved = resolver.resolveVideoPromptFromBytes(fs.readFileSync(reportedWebm));
    assert.ok(resolved);
    assert.match(resolved.promptJson.summary.sentences[0].en, /back-and-forth handjob/i);
    assert.match(resolved.promptJson.overall_soundscape.sentences[0].en, /Soft ambient room tone/i);
    assert.match(resolved.promptJson.overall_soundscape.sentences[0].en, /skin-on-skin/i);
    assert.equal(resolved.promptJson.non_diegetic_music.sentences[0].en, "N/A");
    assert.doesNotMatch(resolved.promptJson.overall_soundscape.sentences[0].en, /Zenitsu|forest ambience|thunder/i);
  });
}

if (fs.existsSync(realWebm)) {
  test("reads the six MiniMax sections from a real ComfyUI WebM", () => {
    const resolved = resolver.resolveVideoPromptFromBytes(fs.readFileSync(realWebm));
    assert.ok(resolved, "expected video metadata prompt");
    assert.match(resolved.promptJson.subject_definitions.sentences[0].en, /Subject 1/i);
    assert.match(resolved.promptJson.summary.sentences[0].en, /second/i);
    assert.ok(resolved.promptJson.detailed_description.sentences[0].en);
    assert.ok(resolved.promptJson.overall_soundscape.sentences[0].en);
    assert.ok(resolved.promptJson.non_diegetic_music.sentences[0].en);
    assert.doesNotMatch(resolved.promptJson.non_diegetic_music.sentences[0].en, /class_type|"width"/);
  });
}

if (fs.existsSync(realMp4)) {
  test("reads the six MiniMax sections from a real ComfyUI MP4", () => {
    const resolved = resolver.resolveVideoPromptFromBytes(fs.readFileSync(realMp4));
    assert.ok(resolved, "expected video metadata prompt");
    assert.match(resolved.promptJson.subject_definitions.sentences[0].en, /Subject 1/i);
    assert.ok(resolved.promptJson.summary.sentences[0].en);
  });
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function box(type, payload) {
  const body = payload instanceof Uint8Array ? payload : new TextEncoder().encode(String(payload));
  const bytes = new Uint8Array(8 + body.length);
  writeUint32(bytes, 0, bytes.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(body, 8);
  return bytes;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    bytes.set(part, offset);
    offset += part.length;
  });
  return bytes;
}

function makeMp4WithPrompt(promptJson) {
  const encoder = new TextEncoder();
  const keyName = encoder.encode("mdtaprompt");
  const keyEntry = new Uint8Array(4 + keyName.length);
  writeUint32(keyEntry, 0, keyEntry.length);
  keyEntry.set(keyName, 4);
  const keysBody = new Uint8Array(8 + keyEntry.length);
  writeUint32(keysBody, 4, 1);
  keysBody.set(keyEntry, 8);
  const dataType = new Uint8Array(8);
  dataType[3] = 1;
  const data = box("data", concat([dataType, encoder.encode(promptJson)]));
  const item = new Uint8Array(8 + data.length);
  writeUint32(item, 0, item.length);
  item[7] = 1;
  item.set(data, 8);
  const keys = box("keys", keysBody);
  const ilst = box("ilst", item);
  const hdlr = box("hdlr", new Uint8Array(21));
  const metaBody = concat([new Uint8Array(4), hdlr, keys, ilst]);
  const meta = box("meta", metaBody);
  const udta = box("udta", meta);
  const moov = box("moov", udta);
  const ftyp = box("ftyp", "isomisomiso2mp41");
  return concat([ftyp, moov]);
}

function writeVint(value, width) {
  const bytes = new Uint8Array(width);
  let remaining = value;
  for (let index = width - 1; index >= 0; index -= 1) {
    bytes[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  bytes[0] |= 0x80 >> (width - 1);
  return bytes;
}

function ebml(idBytes, payload) {
  const body = payload instanceof Uint8Array ? payload : new TextEncoder().encode(String(payload));
  return concat([idBytes, writeVint(body.length, 2), body]);
}

function makeWebmWithPrompt(promptJson) {
  const tagName = ebml(Uint8Array.of(0x45, 0xa3), "PROMPT");
  const tagString = ebml(Uint8Array.of(0x44, 0x87), promptJson);
  const simpleTag = ebml(Uint8Array.of(0x67, 0xc8), concat([tagName, tagString]));
  const tag = ebml(Uint8Array.of(0x73, 0x73), simpleTag);
  const tags = ebml(Uint8Array.of(0x12, 0x54, 0xc3, 0x67), tag);
  const segment = ebml(Uint8Array.of(0x18, 0x53, 0x80, 0x67), tags);
  const ebmlHeader = ebml(Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3), "webm");
  return concat([ebmlHeader, segment]);
}
