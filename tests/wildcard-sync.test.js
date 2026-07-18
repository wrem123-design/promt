const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildWildcardRecord, rebuildWildcards, syncWildcards } = require("../wildcard-sync.js");

function makeItem(id, suffix = id) {
  const section = (text) => ({ sentences: [{ en: text, ko: "" }] });
  return {
    id,
    promptJson: {
      appearance: section(`appearance ${suffix}`),
      outfit: section(`outfit ${suffix}.`),
      background: section(`background ${suffix}.`),
      expression_pose: section(`pose ${suffix}.`),
      details: section(`details ${suffix}.`),
    },
  };
}

async function makeFixture(items, appearanceLines = [], scenarioLines = []) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-wildcard-sync-"));
  const dataDir = path.join(root, "data");
  const wildcardDir = path.join(root, "wildcards", "items");
  const itemsPath = path.join(dataDir, "items.json");
  const statePath = path.join(dataDir, "wildcard-sync-state.json");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(wildcardDir, { recursive: true });
  await fs.writeFile(itemsPath, JSON.stringify(items), "utf8");
  await fs.writeFile(path.join(wildcardDir, "appearance.txt"), appearanceLines.join("\n") + (appearanceLines.length ? "\n" : ""), "utf8");
  await fs.writeFile(path.join(wildcardDir, "scenario.txt"), scenarioLines.join("\n") + (scenarioLines.length ? "\n" : ""), "utf8");
  return { root, itemsPath, statePath, wildcardDir };
}

async function readLines(filePath) {
  return (await fs.readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean);
}

test("scenario is built in outfit, background, pose, details order on one physical line", () => {
  const record = buildWildcardRecord(makeItem("new"));
  assert.deepEqual(record, {
    id: "new",
    appearance: "appearance new",
    scenario: "outfit new. background new. pose new. details new.",
  });
});

test("first run establishes the current items as a baseline without changing wildcard files", async (t) => {
  const items = [makeItem("old-1"), makeItem("old-2")];
  const fixture = await makeFixture(items, ["appearance old-1", "appearance old-2"], [
    "outfit old-1. background old-1. pose old-1. details old-1.",
    "outfit old-2. background old-2. pose old-2. details old-2.",
    "creative scenario that must stay untouched",
  ]);
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const result = await syncWildcards({
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
    now: () => "2026-07-18T00:00:00.000Z",
  });

  assert.equal(result.initialized, true);
  assert.equal(result.appearanceAdded, 0);
  assert.equal(result.scenarioAdded, 0);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [
    "outfit old-1. background old-1. pose old-1. details old-1.",
    "outfit old-2. background old-2. pose old-2. details old-2.",
    "creative scenario that must stay untouched",
  ]);
  const state = JSON.parse(await fs.readFile(fixture.statePath, "utf8"));
  assert.deepEqual(Object.keys(state.processedItems).sort(), ["old-1", "old-2"]);
});

test("later runs append only new items, keep creative lines, and are idempotent", async (t) => {
  const oldItem = makeItem("old");
  const fixture = await makeFixture([oldItem], ["appearance old"], [
    "outfit old. background old. pose old. details old.",
    "creative scenario",
  ]);
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = {
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
    now: () => "2026-07-18T00:00:00.000Z",
  };
  await syncWildcards(options);
  await fs.writeFile(fixture.itemsPath, JSON.stringify([oldItem, makeItem("new")]), "utf8");

  const first = await syncWildcards(options);
  const second = await syncWildcards(options);

  assert.equal(first.newItems, 1);
  assert.equal(first.appearanceAdded, 1);
  assert.equal(first.scenarioAdded, 1);
  assert.equal(second.newItems, 0);
  assert.equal(second.appearanceAdded, 0);
  assert.equal(second.scenarioAdded, 0);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "appearance.txt")), ["appearance old", "appearance new"]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [
    "outfit old. background old. pose old. details old.",
    "creative scenario",
    "outfit new. background new. pose new. details new.",
  ]);
});

test("a new ID with existing prompt text is marked processed but not duplicated", async (t) => {
  const fixture = await makeFixture([makeItem("old", "same")], ["appearance same"], ["outfit same. background same. pose same. details same."]);
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = { ...fixture, refreshWildcards: async () => ({ refreshed: false, message: "offline" }) };
  await syncWildcards(options);
  await fs.writeFile(fixture.itemsPath, JSON.stringify([makeItem("old", "same"), makeItem("new-id", "same")]), "utf8");

  const result = await syncWildcards(options);

  assert.equal(result.newItems, 1);
  assert.equal(result.appearanceAdded, 0);
  assert.equal(result.scenarioAdded, 0);
  assert.equal(result.duplicatesSkipped, 2);
  assert.equal(result.refreshed, false);
  const state = JSON.parse(await fs.readFile(fixture.statePath, "utf8"));
  assert.ok(state.processedItems["new-id"]);
});

test("malformed new items remain pending so they can be fixed and retried", async (t) => {
  const oldItem = makeItem("old");
  const fixture = await makeFixture([oldItem], ["appearance old"], ["outfit old. background old. pose old. details old."]);
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = { ...fixture, refreshWildcards: async () => ({ refreshed: true, message: "ok" }) };
  await syncWildcards(options);
  await fs.writeFile(fixture.itemsPath, JSON.stringify([oldItem, { id: "broken", promptJson: {} }]), "utf8");

  const result = await syncWildcards(options);

  assert.equal(result.invalidItems, 1);
  const state = JSON.parse(await fs.readFile(fixture.statePath, "utf8"));
  assert.equal(state.processedItems.broken, undefined);
});

test("special JavaScript object keys are treated as ordinary item IDs", async (t) => {
  const oldItem = makeItem("old");
  const fixture = await makeFixture([oldItem], ["appearance old"], ["outfit old. background old. pose old. details old."]);
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = { ...fixture, refreshWildcards: async () => ({ refreshed: true, message: "ok" }) };
  await syncWildcards(options);
  await fs.writeFile(fixture.itemsPath, JSON.stringify([oldItem, makeItem("__proto__")]), "utf8");

  const result = await syncWildcards(options);

  assert.equal(result.newItems, 1);
  assert.equal(result.appearanceAdded, 1);
  assert.equal(result.scenarioAdded, 1);
});

test("full rebuild replaces wildcard files with only the current archive items", async (t) => {
  const first = makeItem("keep");
  const removed = makeItem("remove");
  const duplicateText = makeItem("same-text-new-id", "keep");
  const fixture = await makeFixture([first, removed, duplicateText], ["manual appearance"], ["manual scenario"]);
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = {
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
    now: () => "2026-07-18T12:00:00.000Z",
  };

  const initial = await rebuildWildcards(options);

  assert.equal(initial.rebuilt, true);
  assert.equal(initial.totalItems, 3);
  assert.equal(initial.validItems, 3);
  assert.equal(initial.appearanceWritten, 2);
  assert.equal(initial.scenarioWritten, 2);
  assert.equal(initial.duplicatesSkipped, 2);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "appearance.txt")), ["appearance keep", "appearance remove"]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [
    "outfit keep. background keep. pose keep. details keep.",
    "outfit remove. background remove. pose remove. details remove.",
  ]);

  await fs.writeFile(fixture.itemsPath, JSON.stringify([first]), "utf8");
  const afterDelete = await rebuildWildcards(options);
  const state = JSON.parse(await fs.readFile(fixture.statePath, "utf8"));

  assert.equal(afterDelete.appearanceWritten, 1);
  assert.equal(afterDelete.scenarioWritten, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "appearance.txt")), ["appearance keep"]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [
    "outfit keep. background keep. pose keep. details keep.",
  ]);
  assert.deepEqual(Object.keys(state.processedItems), ["keep"]);
});

test("full rebuild excludes malformed items and can produce empty wildcard files", async (t) => {
  const fixture = await makeFixture([{ id: "broken", promptJson: {} }], ["stale appearance"], ["stale scenario"]);
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const result = await rebuildWildcards({
    ...fixture,
    refreshWildcards: async () => ({ refreshed: false, message: "offline" }),
  });

  assert.equal(result.rebuilt, true);
  assert.equal(result.validItems, 0);
  assert.equal(result.invalidItems, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "appearance.txt")), []);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), []);
});

test("the converter UI exposes a wildcard update action and server endpoint", async () => {
  const appSource = await fs.readFile(path.join(__dirname, "..", "app.js"), "utf8");
  const serverSource = await fs.readFile(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(appSource, /data-action="syncWildcards"/);
  assert.match(appSource, /data-action="rebuildWildcards"/);
  assert.match(appSource, /mode=rebuild/);
  assert.match(appSource, /\/api\/wildcards\/sync/);
  assert.match(serverSource, /rebuildWildcards/);
  assert.match(serverSource, /wildcard_sync_in_progress/);
  assert.match(serverSource, /\/api\/wildcards\/sync/);
});
