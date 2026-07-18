const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function extractExifTagNames(source) {
  const match = source.match(/const tagNames = \{([\s\S]*?)\n\s*\};/);
  assert.ok(match, "extractExifTiff tagNames mapping must exist");
  return Function(`"use strict"; return ({${match[1]}});`)();
}

test("recognizes ComfyUI Image Saver WebP workflow and prompt EXIF tags", () => {
  const tagNames = extractExifTagNames(appSource);

  assert.equal(tagNames[0x010f], "Make");
  assert.equal(tagNames[0x0110], "Model");
});
