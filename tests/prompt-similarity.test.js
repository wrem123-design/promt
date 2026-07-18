const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const {
  buildDuplicateIndex,
  calculateCorePromptSimilarity,
  corePromptSignature,
  findCorePromptDuplicate,
  isCorePromptDuplicate,
  rankByPromptSimilarity,
} = require("../prompt-similarity.js");

function makeItem(id, sections = {}) {
  const values = {
    appearance: "adult woman with long black hair",
    outfit: "red sleeveless mini dress with a black shoulder bag",
    background: "night city street outside a glass front cafe",
    expression_pose: "standing front-facing with one hand raised",
    details: "smartphone photograph with natural skin texture",
    ...sections,
  };
  return {
    id,
    title: sections.title || `제목 ${id}`,
    tags: sections.tags || ["태그"],
    promptJson: Object.fromEntries([
      "appearance",
      "outfit",
      "background",
      "expression_pose",
      "details",
    ].map((key) => [key, { sentences: [{ en: values[key], ko: "" }] }])),
  };
}

test("core similarity ignores title, tags, appearance, pose, and details", () => {
  const left = makeItem("left");
  const right = makeItem("right", {
    title: "완전히 다른 제목",
    tags: ["전혀", "다른", "태그"],
    appearance: "short blonde hair and pale skin",
    expression_pose: "sitting sideways and looking away",
    details: "oil painting with dramatic grain",
  });

  assert.equal(calculateCorePromptSimilarity(left, right), 100);
  assert.equal(isCorePromptDuplicate(left, right), true);
  assert.equal(corePromptSignature(left), corePromptSignature(right));
});

test("different outfit and background are not duplicates even when appearance matches", () => {
  const left = makeItem("left");
  const right = makeItem("right", {
    outfit: "blue winter parka with hiking boots",
    background: "snow covered mountain trail at sunrise",
  });

  assert.equal(isCorePromptDuplicate(left, right), false);
  assert.ok(calculateCorePromptSimilarity(left, right) < 50);
});

test("duplicate lookup finds another core match and excludes the current item", () => {
  const original = makeItem("original");
  const candidate = makeItem("candidate", { appearance: "short blonde hair" });
  const unrelated = makeItem("unrelated", {
    outfit: "blue winter parka with hiking boots",
    background: "snow covered mountain trail at sunrise",
  });

  assert.equal(findCorePromptDuplicate([unrelated, original], candidate)?.id, "original");
  assert.equal(findCorePromptDuplicate([candidate], candidate, { excludeId: "candidate" }), null);
});

test("duplicate indexing computes one key per item and reuses the result for card lookups", () => {
  const items = [
    makeItem("duplicate-a"),
    makeItem("unique", {
      outfit: "blue winter parka with hiking boots",
      background: "snow covered mountain trail at sunrise",
    }),
    makeItem("duplicate-b", { appearance: "short blonde hair" }),
  ];
  let keyCalls = 0;
  const index = buildDuplicateIndex(
    items,
    (item) => {
      keyCalls += 1;
      return corePromptSignature(item);
    },
    (item) => item.id,
  );

  assert.equal(keyCalls, items.length);
  assert.deepEqual([...index.duplicateIds].sort(), ["duplicate-a", "duplicate-b"]);
  assert.equal(index.duplicateIds.has("duplicate-a"), true);
  assert.equal(index.duplicateIds.has("unique"), false);
});

test("100 percent is reserved for the same normalized outfit and background", () => {
  const original = makeItem("original");
  const punctuationOnly = makeItem("punctuation", {
    outfit: "  RED sleeveless mini dress · with a black shoulder bag! ",
    background: "Night city street, outside a glass-front cafe.",
  });
  const editedBackground = makeItem("edited", {
    background: "night city street outside a brick front cafe",
  });

  assert.equal(calculateCorePromptSimilarity(original, punctuationOnly), 100);
  assert.ok(calculateCorePromptSimilarity(original, editedBackground) < 100);
});

test("Korean outfit and background remain comparable across spacing and punctuation", () => {
  const left = makeItem("left", {
    outfit: "붉은 민소매 미니 드레스, 검은 숄더백",
    background: "밤의 네온 카페 거리",
  });
  const right = makeItem("right", {
    outfit: "붉은 민소매 미니드레스 · 검은 숄더백",
    background: "밤의 네온 카페거리",
  });

  assert.ok(calculateCorePromptSimilarity(left, right) >= 80);
});

test("similarity ranking keeps exact duplicates adjacent as a group", () => {
  const items = [
    makeItem("duplicate-a"),
    makeItem("unrelated", {
      outfit: "yellow raincoat with rubber boots",
      background: "stormy fishing harbor beside steel boats",
    }),
    makeItem("duplicate-b", {
      appearance: "short blonde hair",
      expression_pose: "sitting sideways",
      details: "watercolor illustration",
    }),
    makeItem("near-a", {
      outfit: "white school blouse with a navy pleated skirt",
      background: "bright stone staircase inside a school hall",
    }),
    makeItem("near-b", {
      outfit: "white school blouse with a gray pleated skirt",
      background: "bright stone staircase inside a school hall",
    }),
  ];

  const ranked = rankByPromptSimilarity(items, (item) => item, (item) => item.id);
  const duplicateIndexes = ["duplicate-a", "duplicate-b"]
    .map((id) => ranked.findIndex((entry) => entry.item.id === id))
    .sort((left, right) => left - right);

  assert.equal(duplicateIndexes[1] - duplicateIndexes[0], 1);
  duplicateIndexes.forEach((index) => assert.equal(ranked[index].score, 100));
  assert.equal(ranked[duplicateIndexes[0]].matchId, ranked[duplicateIndexes[1]].item.id);
  assert.equal(ranked[duplicateIndexes[1]].matchId, ranked[duplicateIndexes[0]].item.id);
});

test("deleting an exact partner recalculates and moves the remaining item behind a stronger pair", () => {
  const duplicateA = makeItem("duplicate-a");
  const duplicateB = makeItem("duplicate-b", { appearance: "short blonde hair" });
  const nearA = makeItem("near-a", {
    outfit: "white school blouse with a navy pleated skirt",
    background: "bright stone staircase inside a school hall",
  });
  const nearB = makeItem("near-b", {
    outfit: "white school blouse with a gray pleated skirt",
    background: "bright stone staircase inside a school hall",
  });
  const unrelated = makeItem("unrelated", {
    outfit: "yellow raincoat with rubber boots",
    background: "stormy fishing harbor beside steel boats",
  });

  const beforeDelete = rankByPromptSimilarity(
    [duplicateA, unrelated, nearA, duplicateB, nearB],
    (item) => item,
    (item) => item.id,
  );
  assert.equal(beforeDelete.find((entry) => entry.item.id === "duplicate-a").score, 100);

  const afterDelete = rankByPromptSimilarity(
    [duplicateA, unrelated, nearA, nearB],
    (item) => item,
    (item) => item.id,
  );
  const remainingIndex = afterDelete.findIndex((entry) => entry.item.id === "duplicate-a");
  const nearIndexes = ["near-a", "near-b"].map((id) => afterDelete.findIndex((entry) => entry.item.id === id));

  assert.ok(remainingIndex > Math.max(...nearIndexes));
  assert.ok(afterDelete[remainingIndex].score < 100);
});

test("items without both core prompt sections stay unmatched", () => {
  const items = [
    { id: "empty", promptJson: null },
    makeItem("filled"),
    makeItem("missing-background", { background: "" }),
  ];

  const ranked = rankByPromptSimilarity(items, (item) => item, (item) => item.id);
  const unmatched = ranked.filter((entry) => entry.item.id !== "filled");

  assert.ok(unmatched.every((entry) => entry.score === 0 && entry.matchId === null));
});

test("the gallery and upload flow use the structured core prompt rules", async () => {
  const root = path.join(__dirname, "..");
  const [appSource, indexSource, serverSource] = await Promise.all([
    fs.readFile(path.join(root, "app.js"), "utf8"),
    fs.readFile(path.join(root, "index.html"), "utf8"),
    fs.readFile(path.join(root, "server.js"), "utf8"),
  ]);

  assert.match(appSource, /value="similarity"/);
  assert.match(appSource, /rankByPromptSimilarity/);
  assert.match(appSource, /buildDuplicateIndex/);
  assert.match(appSource, /corePromptSignature/);
  assert.match(appSource, /findCorePromptDuplicate/);
  assert.match(appSource, /refreshBulkSelectionUi/);
  assert.match(appSource, /의상 50%[^\n]+배경 50%/);

  const categoryToggle = appSource.match(/if \(action === "bulkCategoryToggleItem"\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  const deleteToggle = appSource.match(/if \(action === "bulkToggleItem"\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(categoryToggle, /refreshBulkSelectionUi/);
  assert.doesNotMatch(categoryToggle, /\brender\(/);
  assert.match(deleteToggle, /refreshBulkSelectionUi/);
  assert.doesNotMatch(deleteToggle, /\brender\(/);
  assert.match(indexSource, /prompt-similarity\.js/);
  assert.match(serverSource, /\/prompt-similarity\.js/);
});
