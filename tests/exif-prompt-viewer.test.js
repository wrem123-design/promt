const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function functionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`${name} has an unterminated body`);
}

test("topbar removes server storage status and places image prompt viewer between classification and settings", () => {
  const topbar = functionSource("renderTopbar");
  const classificationIndex = topbar.indexOf('data-action="loraSorter"');
  const viewerIndex = topbar.indexOf('iconButton("promptViewer"');
  const settingsIndex = topbar.indexOf('iconButton("settings"');

  assert.doesNotMatch(topbar, /renderPersistenceStatus/);
  assert.doesNotMatch(topbar, /LoRA 분류/);
  assert.match(topbar, /사진 분류/);
  assert.ok(classificationIndex >= 0 && viewerIndex > classificationIndex && settingsIndex > viewerIndex);
});

test("topbar uses a photo glyph and a recognizable cog glyph", () => {
  const iconSource = functionSource("navIcon");

  assert.match(iconSource, /photo:/);
  assert.match(iconSource, /settings-gear-teeth/);
});

test("image prompt modal is limited to upload, five prompt sections, and copy controls", () => {
  const modal = functionSource("renderModal");
  const viewer = functionSource("renderPromptViewer");

  assert.match(modal, /이미지 프롬프트 확인/);
  assert.match(modal, /renderPromptViewer\(\)/);
  assert.match(viewer, /promptViewerFileInput/);
  assert.match(viewer, /sectionMeta\.map/);
  assert.match(viewer, /copyPromptViewerSection/);
  assert.match(viewer, /copyPromptViewerAll/);
  assert.match(viewer, /copyPromptViewerWithoutFace/);
  assert.doesNotMatch(viewer, /제목|카테고리|기타 설명|번역/);
});

test("image prompt viewer binds immediate file inspection and has responsive presentation styles", () => {
  const bindEvents = functionSource("bindPromptViewerEvents");
  const inspectFile = functionSource("inspectPromptViewerFile");

  assert.match(bindEvents, /change/);
  assert.match(bindEvents, /drop/);
  assert.match(inspectFile, /readPromptViewerFile/);
  assert.match(inspectFile, /maxFileSizeMb/);
  assert.match(stylesSource, /\.prompt-viewer-shell/);
  assert.match(stylesSource, /\.prompt-viewer-sections/);
  assert.match(stylesSource, /\.prompt-viewer-preview/);
});

test("structured image metadata outranks a noisier raw byte scan", () => {
  const source = functionSource("promptCandidateScore");
  const score = Function(`"use strict"; ${source}; return promptCandidateScore;`)();
  const prompt = ["appearance", "outfit", "background", "pose", "details"].join("\n\n");

  assert.ok(
    score({ source: "parameters", text: prompt })
      > score({ source: "raw-scan", text: `parameters ${prompt} IEND` }),
  );
});
