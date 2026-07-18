(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptArchiveExifPromptResolver = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function cleanText(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function normalizeLine(value) {
    return cleanText(value).replace(/\s+/g, " ").trim();
  }

  function parseEmbeddedJson(value) {
    const text = cleanText(value);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_error) {
      return null;
    }
  }

  function graphNodes(value) {
    if (!value || Array.isArray(value) || typeof value !== "object") return null;
    const entries = Object.entries(value).filter(([, node]) => node && typeof node === "object" && !Array.isArray(node));
    if (!entries.some(([, node]) => typeof node.class_type === "string")) return null;
    return new Map(entries.map(([id, node]) => [String(id), node]));
  }

  function resolveInput(value, nodes, visited) {
    if (typeof value === "string") return { text: cleanText(value), nodeId: "" };
    if (Array.isArray(value) && value.length >= 1) return resolveNode(String(value[0]), nodes, visited);
    return null;
  }

  function resolveNode(nodeId, nodes, visited) {
    if (!nodeId || visited.has(nodeId)) return null;
    const node = nodes.get(nodeId);
    if (!node) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : {};
    const classType = String(node.class_type || "").toLowerCase();

    if (classType.includes("impactswitch")) {
      const selected = Math.max(1, Math.trunc(Number(inputs.select) || 1));
      return resolveInput(inputs[`input${selected}`], nodes, nextVisited);
    }
    if (classType.includes("promptconcat")) {
      const left = resolveInput(inputs.prompt1, nodes, nextVisited)?.text || "";
      const right = resolveInput(inputs.prompt2, nodes, nextVisited)?.text || "";
      const text = [left, right].filter(Boolean).join(typeof inputs.separator === "string" ? inputs.separator : " ");
      return text ? { text: cleanText(text), nodeId } : null;
    }
    if (classType.includes("wildcardprocessor") && typeof inputs.populated_text === "string") {
      return { text: cleanText(inputs.populated_text), nodeId };
    }
    if (classType.includes("primitivestring") && typeof inputs.value === "string") {
      return { text: cleanText(inputs.value), nodeId };
    }

    for (const key of ["populated_text", "value", "text", "string", "prompt"]) {
      const resolved = resolveInput(inputs[key], nodes, nextVisited);
      if (resolved?.text) return resolved.nodeId ? resolved : { ...resolved, nodeId };
    }
    return null;
  }

  function resolveComfyPrompt(entries) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const parsed = parseEmbeddedJson(entry?.text);
      const nodes = graphNodes(parsed);
      if (!nodes) continue;
      const positiveNodes = [...nodes.entries()].filter(([, node]) => {
        const classType = String(node.class_type || "").toLowerCase();
        const title = String(node._meta?.title || "").toLowerCase();
        return classType.includes("cliptextencode") && title.includes("positive");
      });
      for (const [, node] of positiveNodes) {
        const resolved = resolveInput(node.inputs?.text, nodes, new Set());
        if (resolved?.text && resolved.text.length > 20) {
          return {
            ...resolved,
            source: `${entry.source || "metadata"}:comfy-positive-path`,
          };
        }
      }
    }
    return null;
  }

  function paragraphSections(text) {
    const paragraphs = cleanText(text).split(/\n\s*\n+/).map(normalizeLine).filter(Boolean);
    if (paragraphs.length < 5) return null;
    return {
      appearance: paragraphs[0],
      outfit: paragraphs[1],
      background: paragraphs[2],
      expression_pose: paragraphs[3],
      details: paragraphs.slice(4).join(" "),
    };
  }

  function sentenceSegments(text) {
    const value = normalizeLine(text);
    const starts = [0];
    const boundary = /[.!?]\s+(?=\S)/g;
    let match;
    while ((match = boundary.exec(value))) starts.push(match.index + match[0].length);
    return starts.map((start, index) => ({
      start,
      end: starts[index + 1] ?? value.length,
      text: value.slice(start, starts[index + 1] ?? value.length).trim(),
    })).filter((segment) => segment.text);
  }

  function startsWithOneOf(value, patterns) {
    const text = value.toLowerCase();
    return patterns.some((pattern) => text.startsWith(pattern));
  }

  function splitScenarioByCues(scenario) {
    const value = normalizeLine(scenario);
    const segments = sentenceSegments(value);
    const expressionIndex = segments.findIndex((segment) => startsWithOneOf(segment.text, [
      "camera angle, composition, gaze, and expression",
      "camera angle, composition, gaze and expression",
      "camera angle and gaze",
      "camera angle, gaze",
    ]));
    if (expressionIndex < 2) return null;
    const backgroundIndex = segments.findIndex((segment, index) => index > 0 && index < expressionIndex && startsWithOneOf(segment.text, [
      "the scene takes place",
      "the scene is set",
      "the setting is",
      "the setting takes place",
      "the setting includes",
      "the setting shows",
    ]));
    if (backgroundIndex < 1) return null;
    const detailOffset = segments.slice(expressionIndex + 1).findIndex((segment) => startsWithOneOf(segment.text, [
      "shot on ",
      "shot with ",
      "captured with ",
      "photorealistic ",
      "high-detail ",
      "high-resolution ",
      "cinematic yet believable ",
      "polished smartphone",
      "editorial smartphone",
      "professional lifestyle",
    ]));
    if (detailOffset < 0) return null;
    const detailIndex = expressionIndex + 1 + detailOffset;
    const backgroundStart = segments[backgroundIndex].start;
    const expressionStart = segments[expressionIndex].start;
    const detailsStart = segments[detailIndex].start;
    return {
      outfit: value.slice(0, backgroundStart).trim(),
      background: value.slice(backgroundStart, expressionStart).trim(),
      expression_pose: value.slice(expressionStart, detailsStart).trim(),
      details: value.slice(detailsStart).trim(),
    };
  }

  function splitResolvedPromptSections(text, knownScenarios = []) {
    const direct = paragraphSections(text);
    if (direct) return direct;
    const paragraphs = cleanText(text).split(/\n\s*\n+/).map(normalizeLine).filter(Boolean);
    if (paragraphs.length !== 2) return null;
    const [appearance, scenario] = paragraphs;
    const known = knownScenarios.find((entry) => normalizeLine(entry?.scenario) === normalizeLine(scenario));
    if (known && [known.outfit, known.background, known.expression_pose, known.details].every(Boolean)) {
      return {
        appearance,
        outfit: normalizeLine(known.outfit),
        background: normalizeLine(known.background),
        expression_pose: normalizeLine(known.expression_pose),
        details: normalizeLine(known.details),
      };
    }
    const scenarioSections = splitScenarioByCues(scenario);
    return scenarioSections ? { appearance, ...scenarioSections } : null;
  }

  return {
    resolveComfyPrompt,
    splitResolvedPromptSections,
  };
});
