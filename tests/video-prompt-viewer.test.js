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

test("handleAction opens video prompt viewer only in video mode", () => {
  const handleAction = functionSource("handleAction");

  assert.match(handleAction, /action === "videoPromptViewer"/);
  assert.match(handleAction, /비디오 프롬프트 확인은 비디오 모드에서만/);
  assert.match(handleAction, /copyVideoPromptViewerAll/);
  assert.match(handleAction, /copyVideoPromptViewerSection/);
  assert.match(handleAction, /clearVideoPromptViewer/);
});

test("video prompt viewer copy helpers skip empty sections and omit face-exclude", () => {
  const copyAll = functionSource("videoPromptViewerCopyText");
  const copySection = functionSource("videoPromptViewerSectionText");
  const viewer = functionSource("renderVideoPromptViewer");

  assert.match(copyAll, /videoSectionMeta/);
  assert.match(copyAll, /filter\(Boolean\)/);
  assert.match(copySection, /sentence\.en/);
  assert.doesNotMatch(viewer, /excludeAppearance|얼굴/);
});
