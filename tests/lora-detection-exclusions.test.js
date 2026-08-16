const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sorter = require("../lora-sorter.js");

function lora(pathValue, name, strength = 1) {
  return { path: pathValue, name, strength, nodeId: "1" };
}

test("normalizes LoRA exclusion names across folders, case, and model extensions", () => {
  assert.equal(
    sorter.normalizeLoraExclusion("styles\\PornMaster_Krea2_Realism_slider_V1.SAFETENSORS"),
    "PornMaster_Krea2_Realism_slider_V1",
  );
  assert.equal(
    sorter.isLoraDetectionExcluded(
      lora("STYLES/PORNMASTER_KREA2_REALISM_SLIDER_V1.safetensors", "PornMaster_Krea2_Realism_slider_V1"),
      ["pornmaster_krea2_realism_slider_v1"],
    ),
    true,
  );
  assert.equal(
    sorter.isLoraDetectionExcluded("styles/PornMaster_Krea2_Realism_slider_V1.ckpt", "pornmaster_krea2_realism_slider_v1"),
    true,
  );
});

test("removes excluded style LoRA from a mixed character classification", () => {
  const inspection = {
    status: "matched",
    loras: [
      lora("characters\\H2H_Stella_v1.safetensors", "H2H_Stella_v1", 0.8),
      lora("styles\\PornMaster_Krea2_Realism_slider_V1.safetensors", "PornMaster_Krea2_Realism_slider_V1", 1),
    ],
  };

  assert.deepEqual(sorter.classificationForInspection(inspection, ["pornmaster_krea2_realism_slider_v1"]), {
    key: "characters\\h2h_stella_v1.safetensors",
    label: "H2H_Stella_v1",
    kind: "single",
  });
  assert.equal(inspection.loras.length, 2, "classification must not mutate scanned metadata");
});

test("keeps images with only excluded LoRAs in a non-movable state", () => {
  const inspection = {
    status: "matched",
    loras: [
      lora("styles\\PornMaster_Krea2_Realism_slider_V1.safetensors", "PornMaster_Krea2_Realism_slider_V1"),
    ],
  };

  assert.deepEqual(sorter.classificationForInspection(inspection, ["PornMaster_Krea2_Realism_slider_V1.safetensors"]), {
    key: "__excluded_loras_only__",
    label: "감지 제외 LoRA만 있음",
    kind: "excluded-only",
  });
});

test("regroups an existing mixed scan into the remaining character LoRA without rescanning", () => {
  const stella = lora("characters\\H2H_Stella_v1.safetensors", "H2H_Stella_v1", 0.8);
  const realism = lora("styles\\PornMaster_Krea2_Realism_slider_V1.safetensors", "PornMaster_Krea2_Realism_slider_V1");
  const files = [
    { name: "mixed.webp", inspection: { status: "matched", loras: [stella, realism] } },
    { name: "portrait.webp", inspection: { status: "matched", loras: [stella] } },
    { name: "style-only.webp", inspection: { status: "matched", loras: [realism] } },
  ];

  const groups = sorter.groupInspectedFiles(files, new Set(["PornMaster_Krea2_Realism_slider_V1"]));

  assert.deepEqual(groups.map(({ label, kind, count, movable }) => ({ label, kind, count, movable })), [
    { label: "H2H_Stella_v1", kind: "single", count: 2, movable: true },
    { label: "감지 제외 LoRA만 있음", kind: "excluded-only", count: 1, movable: false },
  ]);
  assert.deepEqual(groups[0].files.map((entry) => entry.name), ["mixed.webp", "portrait.webp"]);
});

test("sorter UI supports manual and per-result detection exclusions", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

  assert.match(appSource, /detectionExcludedLoras: new Set\(\)/);
  assert.match(appSource, /id="loraDetectionExclusionInput"/);
  assert.match(appSource, /data-action="addLoraDetectionExclusion"/);
  assert.match(appSource, /data-action="removeLoraDetectionExclusion"/);
  assert.match(appSource, /data-action="excludeDetectedLora"/);
  assert.match(appSource, /function refreshLoraSorterGroups\(\)/);
  assert.match(appSource, /groupInspectedFiles\(loraSorterState\.scannedFiles, loraSorterState\.detectionExcludedLoras\)/);
});
