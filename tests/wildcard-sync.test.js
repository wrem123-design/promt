const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildWildcardRecord,
  normalizeWildcardSettings,
  rebuildWildcards,
  syncWildcards,
} = require("../wildcard-sync.js");

function makeItem(id, suffix = id, categoryId = "general") {
  const section = (text) => ({ sentences: [{ en: text, ko: "" }] });
  return {
    id,
    categoryId,
    promptJson: {
      appearance: section(`appearance ${suffix}`),
      outfit: section(`outfit ${suffix}.`),
      background: section(`background ${suffix}.`),
      expression_pose: section(`pose ${suffix}.`),
      details: section(`details ${suffix}.`),
    },
  };
}

async function makeFixture(
  items,
  appearanceLines = [],
  scenarioLines = [],
  nsfwLines = [],
  categories = [{ id: "general", name: "인스타" }, { id: "nsfw", name: "nsfw" }],
  wildcardSettings,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-wildcard-sync-"));
  const dataDir = path.join(root, "data");
  const wildcardDir = path.join(root, "wildcards", "items");
  const itemsPath = path.join(dataDir, "items.json");
  const settingsPath = path.join(dataDir, "settings.json");
  const statePath = path.join(dataDir, "wildcard-sync-state.json");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(wildcardDir, { recursive: true });
  await fs.writeFile(itemsPath, JSON.stringify(items), "utf8");
  await fs.writeFile(settingsPath, JSON.stringify({ categories, wildcardSettings }), "utf8");
  await fs.writeFile(path.join(wildcardDir, "appearance.txt"), appearanceLines.join("\n") + (appearanceLines.length ? "\n" : ""), "utf8");
  await fs.writeFile(path.join(wildcardDir, "scenario.txt"), scenarioLines.join("\n") + (scenarioLines.length ? "\n" : ""), "utf8");
  await fs.writeFile(path.join(wildcardDir, "nsfw.txt"), nsfwLines.join("\n") + (nsfwLines.length ? "\n" : ""), "utf8");
  return { root, itemsPath, settingsPath, statePath, wildcardDir };
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

test("wildcard settings preserve the existing NSFW split as the default rule", () => {
  assert.deepEqual(normalizeWildcardSettings(), {
    appearancePath: "appearance.txt",
    defaultScenarioPath: "scenario.txt",
    rules: [{
      id: "nsfw",
      name: "NSFW",
      categoryNames: ["nsfw"],
      outputPath: "nsfw.txt",
      enabled: true,
    }],
  });
});

test("wildcard settings reject unsafe and conflicting output paths", () => {
  assert.throws(
    () => normalizeWildcardSettings({ appearancePath: "../outside.txt" }),
    /상대 경로/,
  );
  assert.throws(
    () => normalizeWildcardSettings({ defaultScenarioPath: "scenario.json" }),
    /\.txt/,
  );
  assert.throws(
    () => normalizeWildcardSettings({
      appearancePath: "shared.txt",
      defaultScenarioPath: "shared.txt",
    }),
    /중복/,
  );
  assert.throws(
    () => normalizeWildcardSettings({
      rules: [{
        id: "unsafe",
        name: "Unsafe",
        categoryNames: ["nsfw"],
        outputPath: "C:\\outside.txt",
        enabled: true,
      }],
    }),
    /상대 경로/,
  );
});

test("wildcard settings repair duplicate rule IDs without dropping rules", () => {
  const normalized = normalizeWildcardSettings({
    appearancePath: "appearance.txt",
    defaultScenarioPath: "scenario.txt",
    rules: [
      {
        id: "duplicate",
        name: "첫 규칙",
        categoryNames: ["첫째"],
        outputPath: "first.txt",
        enabled: true,
      },
      {
        id: "duplicate",
        name: "둘째 규칙",
        categoryNames: ["둘째"],
        outputPath: "second.txt",
        enabled: true,
      },
      {
        id: "duplicate-2",
        name: "셋째 규칙",
        categoryNames: ["셋째"],
        outputPath: "third.txt",
        enabled: true,
      },
    ],
  });

  assert.equal(normalized.rules.length, 3);
  assert.equal(new Set(normalized.rules.map((rule) => rule.id)).size, 3);
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
  await fs.rm(path.join(fixture.wildcardDir, "nsfw.txt"));

  const result = await rebuildWildcards({
    ...fixture,
    refreshWildcards: async () => ({ refreshed: false, message: "offline" }),
  });

  assert.equal(result.rebuilt, true);
  assert.equal(result.validItems, 0);
  assert.equal(result.invalidItems, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "appearance.txt")), []);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), []);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "nsfw.txt")), []);
});

test("full rebuild keeps every appearance but separates NSFW scenarios into nsfw.txt", async (t) => {
  const general = makeItem("general-item", "general", "cat-general");
  const nsfw = makeItem("nsfw-item", "adult", "cat-nsfw");
  const fixture = await makeFixture(
    [general, nsfw],
    ["stale appearance"],
    ["stale scenario"],
    ["stale nsfw"],
    [{ id: "cat-general", name: "인스타" }, { id: "cat-nsfw", name: "  NsFw  " }],
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const result = await rebuildWildcards({
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
  });

  assert.equal(result.appearanceWritten, 2);
  assert.equal(result.scenarioWritten, 1);
  assert.equal(result.nsfwScenarioWritten, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "appearance.txt")), [
    "appearance general",
    "appearance adult",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [
    "outfit general. background general. pose general. details general.",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "nsfw.txt")), [
    "outfit adult. background adult. pose adult. details adult.",
  ]);
});

test("incremental sync migrates existing NSFW scenarios and appends new items to the correct file", async (t) => {
  const general = makeItem("general-old", "general-old", "cat-general");
  const nsfw = makeItem("nsfw-old", "adult-old", "cat-nsfw");
  const fixture = await makeFixture(
    [general, nsfw],
    ["appearance general-old", "appearance adult-old"],
    [
      "outfit general-old. background general-old. pose general-old. details general-old.",
      "outfit adult-old. background adult-old. pose adult-old. details adult-old.",
      "creative scenario that must stay untouched",
    ],
    [],
    [{ id: "cat-general", name: "인스타" }, { id: "cat-nsfw", name: "NSFW" }],
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = {
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
    now: () => "2026-07-25T00:00:00.000Z",
  };

  const initialized = await syncWildcards(options);

  assert.equal(initialized.initialized, true);
  assert.equal(initialized.scenarioMovedToNsfw, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [
    "outfit general-old. background general-old. pose general-old. details general-old.",
    "creative scenario that must stay untouched",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "nsfw.txt")), [
    "outfit adult-old. background adult-old. pose adult-old. details adult-old.",
  ]);

  const generalNew = makeItem("general-new", "general-new", "cat-general");
  const nsfwNew = makeItem("nsfw-new", "adult-new", "cat-nsfw");
  await fs.writeFile(fixture.itemsPath, JSON.stringify([general, nsfw, generalNew, nsfwNew]), "utf8");

  const first = await syncWildcards(options);
  const second = await syncWildcards(options);

  assert.equal(first.newItems, 2);
  assert.equal(first.appearanceAdded, 2);
  assert.equal(first.scenarioAdded, 1);
  assert.equal(first.nsfwScenarioAdded, 1);
  assert.equal(second.newItems, 0);
  assert.equal(second.scenarioAdded, 0);
  assert.equal(second.nsfwScenarioAdded, 0);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [
    "outfit general-old. background general-old. pose general-old. details general-old.",
    "creative scenario that must stay untouched",
    "outfit general-new. background general-new. pose general-new. details general-new.",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "nsfw.txt")), [
    "outfit adult-old. background adult-old. pose adult-old. details adult-old.",
    "outfit adult-new. background adult-new. pose adult-new. details adult-new.",
  ]);
});

test("incremental sync moves a scenario back when its category is no longer NSFW", async (t) => {
  const item = makeItem("category-changed", "category-changed", "cat-general");
  const scenario = "outfit category-changed. background category-changed. pose category-changed. details category-changed.";
  const fixture = await makeFixture(
    [item],
    ["appearance category-changed"],
    [],
    [scenario, "manual nsfw scenario that must stay untouched"],
    [{ id: "cat-general", name: "인스타" }],
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const result = await syncWildcards({
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
  });

  assert.equal(result.scenarioMovedToGeneral, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenario.txt")), [scenario]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "nsfw.txt")), [
    "manual nsfw scenario that must stay untouched",
  ]);
});

test("full rebuild routes ordered category rules into configurable relative output paths", async (t) => {
  const general = makeItem("general-item", "general", "cat-general");
  const adult = makeItem("adult-item", "adult", "cat-adult");
  const cosplay = makeItem("cosplay-item", "cosplay", "cat-cosplay");
  const wildcardSettings = {
    appearancePath: "people/faces.txt",
    defaultScenarioPath: "scenes/general.txt",
    rules: [
      {
        id: "adult",
        name: "성인",
        categoryNames: [" nsfw ", "18+"],
        outputPath: "scenes/adult.txt",
        enabled: true,
      },
      {
        id: "cosplay",
        name: "코스프레",
        categoryNames: ["코스프레"],
        outputPath: "scenes/costume.txt",
        enabled: true,
      },
    ],
  };
  const fixture = await makeFixture(
    [general, adult, cosplay],
    [],
    [],
    [],
    [
      { id: "cat-general", name: "인스타" },
      { id: "cat-adult", name: " NSFW " },
      { id: "cat-cosplay", name: "코스프레" },
    ],
    wildcardSettings,
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const result = await rebuildWildcards({
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
  });

  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "people", "faces.txt")), [
    "appearance general",
    "appearance adult",
    "appearance cosplay",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenes", "general.txt")), [
    "outfit general. background general. pose general. details general.",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenes", "adult.txt")), [
    "outfit adult. background adult. pose adult. details adult.",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenes", "costume.txt")), [
    "outfit cosplay. background cosplay. pose cosplay. details cosplay.",
  ]);
  assert.deepEqual(
    result.scenarioOutputs.map((entry) => [entry.path, entry.written]),
    [
      ["scenes/general.txt", 1],
      ["scenes/adult.txt", 1],
      ["scenes/costume.txt", 1],
    ],
  );
});

test("incremental sync migrates known lines when a rule output path changes", async (t) => {
  const adult = makeItem("adult-item", "adult", "cat-adult");
  const scenario = "outfit adult. background adult. pose adult. details adult.";
  const fixture = await makeFixture(
    [adult],
    ["appearance adult"],
    [],
    [scenario, "manual line remains in the former output"],
    [{ id: "cat-adult", name: "nsfw" }],
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = {
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
  };
  await syncWildcards(options);
  await fs.writeFile(fixture.settingsPath, JSON.stringify({
    categories: [{ id: "cat-adult", name: "nsfw" }],
    wildcardSettings: {
      appearancePath: "appearance.txt",
      defaultScenarioPath: "scenario.txt",
      rules: [{
        id: "adult",
        name: "성인",
        categoryNames: ["nsfw"],
        outputPath: "groups/adult.txt",
        enabled: true,
      }],
    },
  }), "utf8");

  const result = await syncWildcards(options);

  assert.equal(result.newItems, 0);
  assert.equal(result.scenariosMoved, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "nsfw.txt")), [
    "manual line remains in the former output",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "groups", "adult.txt")), [scenario]);
});

test("incremental sync migrates appearances when the configured appearance path changes", async (t) => {
  const item = makeItem("portrait", "portrait", "cat-general");
  const fixture = await makeFixture(
    [item],
    ["appearance portrait", "manual appearance remains"],
    ["outfit portrait. background portrait. pose portrait. details portrait."],
    [],
    [{ id: "cat-general", name: "인스타" }],
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = {
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
  };
  await syncWildcards(options);
  await fs.writeFile(fixture.settingsPath, JSON.stringify({
    categories: [{ id: "cat-general", name: "인스타" }],
    wildcardSettings: {
      appearancePath: "people/portrait.txt",
      defaultScenarioPath: "scenario.txt",
      rules: [],
    },
  }), "utf8");

  const result = await syncWildcards(options);

  assert.equal(result.appearanceMoved, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "appearance.txt")), [
    "manual appearance remains",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "people", "portrait.txt")), [
    "appearance portrait",
  ]);
});

test("version 1 sync state migrates to configured version 2 output paths", async (t) => {
  const item = makeItem("legacy", "legacy", "cat-adult");
  const scenario = "outfit legacy. background legacy. pose legacy. details legacy.";
  const fixture = await makeFixture(
    [item],
    ["appearance legacy"],
    [],
    [scenario],
    [{ id: "cat-adult", name: "nsfw" }],
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const options = {
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
  };
  await syncWildcards(options);
  const legacyState = JSON.parse(await fs.readFile(fixture.statePath, "utf8"));
  legacyState.version = 1;
  delete legacyState.appearancePaths;
  delete legacyState.scenarioPaths;
  await fs.writeFile(fixture.statePath, JSON.stringify(legacyState), "utf8");
  await fs.writeFile(fixture.settingsPath, JSON.stringify({
    categories: [{ id: "cat-adult", name: "nsfw" }],
    wildcardSettings: {
      appearancePath: "people/legacy.txt",
      defaultScenarioPath: "scenes/general.txt",
      rules: [{
        id: "adult",
        name: "성인",
        categoryNames: ["nsfw"],
        outputPath: "scenes/adult.txt",
        enabled: true,
      }],
    },
  }), "utf8");

  const result = await syncWildcards(options);
  const migratedState = JSON.parse(await fs.readFile(fixture.statePath, "utf8"));

  assert.equal(result.newItems, 0);
  assert.equal(result.appearanceMoved, 1);
  assert.equal(result.scenariosMoved, 1);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "people", "legacy.txt")), [
    "appearance legacy",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "scenes", "adult.txt")), [
    scenario,
  ]);
  assert.equal(migratedState.version, 2);
  assert.deepEqual(migratedState.appearancePaths, ["people/legacy.txt"]);
  assert.deepEqual(migratedState.scenarioPaths, ["scenes/general.txt", "scenes/adult.txt"]);
});

test("only the first enabled category rule receives a matching scenario", async (t) => {
  const item = makeItem("ordered", "ordered", "cat-special");
  const fixture = await makeFixture(
    [item],
    [],
    [],
    [],
    [{ id: "cat-special", name: "특별" }],
    {
      appearancePath: "appearance.txt",
      defaultScenarioPath: "scenario.txt",
      rules: [
        {
          id: "disabled",
          name: "비활성",
          categoryNames: ["특별"],
          outputPath: "disabled.txt",
          enabled: false,
        },
        {
          id: "first",
          name: "첫 규칙",
          categoryNames: ["특별"],
          outputPath: "first.txt",
          enabled: true,
        },
        {
          id: "second",
          name: "두 번째 규칙",
          categoryNames: ["특별"],
          outputPath: "second.txt",
          enabled: true,
        },
      ],
    },
  );
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  await rebuildWildcards({
    ...fixture,
    refreshWildcards: async () => ({ refreshed: true, message: "refreshed" }),
  });

  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "first.txt")), [
    "outfit ordered. background ordered. pose ordered. details ordered.",
  ]);
  assert.deepEqual(await readLines(path.join(fixture.wildcardDir, "second.txt")), []);
  await assert.rejects(fs.access(path.join(fixture.wildcardDir, "disabled.txt")));
});

test("the converter UI exposes a wildcard update action and server endpoint", async () => {
  const appSource = await fs.readFile(path.join(__dirname, "..", "app.js"), "utf8");
  const serverSource = await fs.readFile(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(appSource, /data-action="syncWildcards"/);
  assert.match(appSource, /data-action="rebuildWildcards"/);
  assert.match(appSource, /mode=rebuild/);
  assert.match(appSource, /nsfwScenarioWritten/);
  assert.match(appSource, /nsfwScenarioAdded/);
  assert.match(appSource, /와일드카드 분류 규칙/);
  assert.match(appSource, /data-wildcard-rule-categories/);
  assert.match(appSource, /data-action="addWildcardRule"/);
  assert.match(appSource, /\/api\/wildcards\/sync/);
  assert.match(serverSource, /rebuildWildcards/);
  assert.match(serverSource, /settingsPath/);
  assert.match(serverSource, /wildcardSettings/);
  assert.match(serverSource, /normalizeWildcardSettings\(state\.wildcardSettings\)/);
  assert.match(serverSource, /wildcard_sync_in_progress/);
  assert.match(serverSource, /\/api\/wildcards\/sync/);
});
