const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  resolveComfyPrompt,
  splitResolvedPromptSections,
} = require("../exif-prompt-resolver.js");

const appearance = "adult Korean woman with fair smooth skin, dark eyes, glossy pink lips, and deep black hair.";
const outfit = "wearing a fitted dusty rose velvet corset top, a stone gray pleated micro skirt, lace-trim thigh-highs, and platform Mary Jane heels.";
const background = "the scene takes place beside a bank of brushed-metal elevators, with dark wood panels and a patterned rug. she sits near the edge of a lounge chair with both knees angled together.";
const expression = "camera angle, composition, gaze, and expression are important: night smartphone photograph; the frame catches a genuine mid-laugh moment with softened eyes.";
const details = "high-detail lifestyle photography with clean exposure, natural pores, realistic garment tension, practical ambient light, and an unstaged social-media aesthetic.";
const wildcardPrompt = `${appearance}\n\n${outfit} ${background} ${expression} ${details}`;
const staleUserPrompt = ["stale appearance", "stale beige cardigan", "stale cafe", "stale expression", "stale details"].join("\n\n");

function metadataEntries(select = 2) {
  const graph = {
    6: {
      inputs: { text: ["300", 0] },
      class_type: "CLIPTextEncode",
      _meta: { title: "CLIP Text Encode (Positive Prompt)" },
    },
    218: {
      inputs: { value: staleUserPrompt },
      class_type: "PrimitiveStringMultiline",
      _meta: { title: "Switch 1 · 사용자 전체 프롬프트" },
    },
    299: {
      inputs: {
        wildcard_text: "__items/appearance__\n\n__items/scenario__",
        populated_text: wildcardPrompt,
      },
      class_type: "ImpactWildcardProcessor",
      _meta: { title: "Switch 2 · 5문단 전체 랜덤 와일드카드" },
    },
    302: {
      inputs: { value: "custom appearance" },
      class_type: "PrimitiveStringMultiline",
      _meta: { title: "Switch 3 · 사용자 외모 프롬프트 입력" },
    },
    303: {
      inputs: { wildcard_text: "__items/scenario__", populated_text: `${outfit} ${background} ${expression} ${details}` },
      class_type: "ImpactWildcardProcessor",
      _meta: { title: "Switch 3 · 외모 제외 4문단 랜덤 와일드카드" },
    },
    304: {
      inputs: { separator: "\n\n", prompt1: ["302", 0], prompt2: ["303", 0] },
      class_type: "easy promptConcat",
      _meta: { title: "Switch 3 · 사용자 외모 + 랜덤 4문단 결합" },
    },
    300: {
      inputs: { select, input1: ["218", 0], input2: ["299", 0], input3: ["304", 0] },
      class_type: "ImpactSwitch",
      _meta: { title: "프롬프트 선택" },
    },
  };
  return [
    { source: "Make", text: `workflow:${JSON.stringify({ nodes: [] })}` },
    { source: "Model", text: `prompt:${JSON.stringify(graph)}` },
  ];
}

test("selected Switch 2 populated wildcard text wins over an inactive five-paragraph user prompt", () => {
  const resolved = resolveComfyPrompt(metadataEntries(2));

  assert.equal(resolved.text, wildcardPrompt);
  assert.equal(resolved.nodeId, "299");
  assert.match(resolved.source, /Model/);
  assert.doesNotMatch(resolved.text, /stale beige cardigan/);
});

test("Switch 1 resolves its direct user prompt", () => {
  const resolved = resolveComfyPrompt(metadataEntries(1));
  assert.equal(resolved.text, staleUserPrompt);
  assert.equal(resolved.nodeId, "218");
});

test("Switch 3 resolves prompt concatenation with the configured separator", () => {
  const resolved = resolveComfyPrompt(metadataEntries(3));
  assert.equal(resolved.text, `custom appearance\n\n${outfit} ${background} ${expression} ${details}`);
  assert.equal(resolved.nodeId, "304");
});

test("two-paragraph wildcard output is restored to five sections by scenario boundary cues", () => {
  const sections = splitResolvedPromptSections(wildcardPrompt);

  assert.deepEqual(sections, {
    appearance,
    outfit,
    background,
    expression_pose: expression,
    details,
  });
});

test("known app scenario sections are preferred over heuristic splitting", () => {
  const unusualScenario = "a custom garment sentence. an unusual location sentence. a rare camera sentence. a custom detail sentence.";
  const text = `${appearance}\n\n${unusualScenario}`;
  const known = [{
    scenario: unusualScenario,
    outfit: "a custom garment sentence.",
    background: "an unusual location sentence.",
    expression_pose: "a rare camera sentence.",
    details: "a custom detail sentence.",
  }];

  assert.deepEqual(splitResolvedPromptSections(text, known), {
    appearance,
    outfit: known[0].outfit,
    background: known[0].background,
    expression_pose: known[0].expression_pose,
    details: known[0].details,
  });
});

test("malformed or unrelated metadata does not invent a prompt", () => {
  assert.equal(resolveComfyPrompt([{ source: "EXIF", text: "not json" }]), null);
  assert.equal(resolveComfyPrompt([{ source: "EXIF", text: "prompt:{broken json}" }]), null);
  assert.equal(resolveComfyPrompt([{ source: "EXIF", text: "prompt:[1,2,3]" }]), null);
  assert.equal(resolveComfyPrompt([{ source: "EXIF", text: "prompt:{\"value\":\"not a graph\"}" }]), null);
  assert.equal(resolveComfyPrompt(null), null);
  assert.equal(splitResolvedPromptSections("one paragraph only"), null);
});

test("direct five-paragraph prompts retain their existing section boundaries", () => {
  const text = ["appearance", "outfit", "background", "expression", "details one", "details two"].join("\n\n");
  assert.deepEqual(splitResolvedPromptSections(text), {
    appearance: "appearance",
    outfit: "outfit",
    background: "background",
    expression_pose: "expression",
    details: "details one details two",
  });
});

test("generic linked string nodes and direct positive text remain resolvable", () => {
  const linkedText = "a sufficiently long prompt resolved through a generic custom string node";
  const linkedGraph = {
    1: { inputs: { text: ["2", 0] }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } },
    2: { inputs: { prompt: linkedText }, class_type: "CustomStringNode" },
  };
  const linked = resolveComfyPrompt([{ text: `prompt:${JSON.stringify(linkedGraph)}` }]);
  assert.equal(linked.text, linkedText);
  assert.equal(linked.nodeId, "2");
  assert.equal(linked.source, "metadata:comfy-positive-path");

  const directText = "a sufficiently long positive prompt stored directly on the CLIP node";
  const directGraph = {
    1: { inputs: { text: directText }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } },
  };
  assert.equal(resolveComfyPrompt([{ source: "Model", text: `prompt:${JSON.stringify(directGraph)}` }]).text, directText);
});

test("missing, empty, short, and cyclic routing paths fail closed", () => {
  const graphs = [
    { 1: { inputs: { text: null }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } } },
    { 1: { inputs: { text: ["404", 0] }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } } },
    {
      1: { inputs: { text: ["2", 0] }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } },
      2: { inputs: { select: 1, input1: ["2", 0] }, class_type: "ImpactSwitch" },
    },
    {
      1: { inputs: { text: ["2", 0] }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } },
      2: { inputs: { prompt1: null, prompt2: null }, class_type: "easy promptConcat" },
    },
    {
      1: { inputs: { text: ["2", 0] }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } },
      2: { inputs: {}, class_type: "CustomStringNode" },
    },
    { 1: { inputs: { text: "too short" }, class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } } },
    { 1: { inputs: { text: "ignored negative prompt that is definitely long enough" }, class_type: "CLIPTextEncode", _meta: { title: "Negative Prompt" } } },
  ];
  for (const graph of graphs) {
    assert.equal(resolveComfyPrompt([{ source: "Model", text: `prompt:${JSON.stringify(graph)}` }]), null);
  }
});

test("two-paragraph wildcard splitting fails closed when a required cue is absent", () => {
  const noBackground = `${appearance}\n\n${outfit} ${expression} ${details}`;
  const noExpression = `${appearance}\n\n${outfit} ${background} ${details}`;
  const noDetails = `${appearance}\n\n${outfit} ${background} ${expression}`;
  assert.equal(splitResolvedPromptSections(noBackground), null);
  assert.equal(splitResolvedPromptSections(noExpression), null);
  assert.equal(splitResolvedPromptSections(noDetails), null);
});

test("the app loads and prioritizes the ComfyUI graph resolver before generic EXIF candidates", () => {
  const root = path.join(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");

  assert.match(appSource, /PromptArchiveExifPromptResolver\.resolveComfyPrompt\(entries\)/);
  assert.match(appSource, /splitResolvedPromptSections/);
  assert.ok(indexSource.indexOf("exif-prompt-resolver.js") < indexSource.indexOf("app.js"));
  assert.match(serverSource, /exif-prompt-resolver\.js/);
});
