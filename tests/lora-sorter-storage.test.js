const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const storage = require("../lora-sorter-storage.js");

test("LoRA sorter settings preserve folder handles, destinations, exclusions, and options", () => {
  const sourceHandle = { kind: "directory", name: "source" };
  const baseDestinationHandle = { kind: "directory", name: "sorted" };
  const boheeHandle = { kind: "directory", name: "Bohee" };
  const snapshot = storage.snapshotSettings({
    sourceHandle,
    baseDestinationHandle,
    destinationHandles: new Map([["bohee_v1", boheeHandle]]),
    excludedGroupKeys: new Set(["winter_v1"]),
    includeSubfolders: true,
    collisionMode: "skip",
  });
  const restored = storage.hydrateSettings(snapshot);

  assert.equal(restored.sourceHandle, sourceHandle);
  assert.equal(restored.baseDestinationHandle, baseDestinationHandle);
  assert.equal(restored.destinationHandles.get("bohee_v1"), boheeHandle);
  assert.deepEqual([...restored.excludedGroupKeys], ["winter_v1"]);
  assert.equal(restored.includeSubfolders, true);
  assert.equal(restored.collisionMode, "skip");
});

test("LoRA sorter settings reject malformed collections and unsafe option values", () => {
  const restored = storage.hydrateSettings({
    destinations: [["valid", { kind: "directory", name: "valid" }], ["", null], "bad"],
    excludedGroupKeys: ["one", "", 22, "one"],
    includeSubfolders: "yes",
    collisionMode: "overwrite",
  });

  assert.deepEqual([...restored.destinationHandles.keys()], ["valid"]);
  assert.deepEqual([...restored.excludedGroupKeys], ["one"]);
  assert.equal(restored.includeSubfolders, false);
  assert.equal(restored.collisionMode, "rename");
});

test("the browser loads the LoRA settings store and app saves every user-controlled route", () => {
  const root = path.join(__dirname, "..");
  const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(htmlSource, /<script src="lora-sorter-storage\.js"><\/script>[\s\S]*<script src="app\.js"><\/script>/);
  assert.match(serverSource, /\["\/lora-sorter-storage\.js", path\.join\(rootDir, "lora-sorter-storage\.js"\)\]/);
  assert.match(appSource, /restoreLoraSorterSettings\(\)/);
  assert.match(appSource, /saveLoraSorterSettings\(\)/);
  assert.match(appSource, /PromptArchiveLoraSorterStorage\.save/);
  assert.match(appSource, /PromptArchiveLoraSorterStorage\.load/);
});
