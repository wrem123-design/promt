(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptArchiveVideoPromptResolver = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

  const VIDEO_SECTION_META = Object.freeze([
    { key: "subject_definitions", labelKo: "피사체 정의", labelEn: "Subject Definitions", colorKey: "subject" },
    { key: "summary", labelKo: "요약", labelEn: "Summary", colorKey: "summary" },
    { key: "retention_analysis", labelKo: "유지 분석", labelEn: "Retention Analysis", colorKey: "retention" },
    { key: "detailed_description", labelKo: "상세 설명", labelEn: "Detailed Description", colorKey: "description" },
    { key: "overall_soundscape", labelKo: "전체 음향", labelEn: "Overall Soundscape", colorKey: "soundscape" },
    { key: "non_diegetic_music", labelKo: "비재현 음악", labelEn: "Non-diegetic Music", colorKey: "music" },
  ]);

  const VIDEO_SECTION_KEYS = VIDEO_SECTION_META.map((section) => section.key);
  const SECTION_HEADER_PATTERN = new RegExp(
    `(?:^|\\r?\\n)(${VIDEO_SECTION_KEYS.join("|")}):\\s*`,
    "gi",
  );
  const PROMPT_NODE_TYPES = /minimax|referencetovideo|imagetovideo|texttovideo|cliptext|wildcard/i;

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError("바이트 배열이 필요합니다.");
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function ascii(bytes, offset, length) {
    let value = "";
    for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
      value += String.fromCharCode(bytes[offset + index]);
    }
    return value;
  }

  function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function parseEmbeddedJson(value) {
    const text = cleanText(value);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1).replace(/\bNaN\b/g, "null"));
    } catch (_error) {
      return null;
    }
  }

  function emptyVideoPromptJson() {
    return Object.fromEntries(VIDEO_SECTION_KEYS.map((key) => [key, { sentences: [] }]));
  }

  function sectionSentence(key, text, index = 1) {
    const en = cleanText(text);
    if (!en) return null;
    return { id: `${key}-${index}`, en, ko: "" };
  }

  function buildVideoPromptJson(sections) {
    const promptJson = emptyVideoPromptJson();
    VIDEO_SECTION_KEYS.forEach((key) => {
      const text = cleanText(sections?.[key] || "");
      const sentence = sectionSentence(key, text);
      promptJson[key] = { sentences: sentence ? [sentence] : [] };
    });
    return promptJson;
  }

  function videoPromptHasContent(promptJson) {
    return VIDEO_SECTION_KEYS.some((key) => (promptJson?.[key]?.sentences || []).some((sentence) => cleanText(sentence?.en)));
  }

  function formatVideoDurationLabel(seconds) {
    const value = Number(seconds);
    if (!value || value <= 0) return "";
    if (value >= 60) {
      const minutes = Math.floor(value / 60);
      const rest = Math.round(value - minutes * 60);
      return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
    }
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 0.05) return `${rounded}s`;
    return `${String(value.toFixed(1)).replace(/\.0$/, "")}s`;
  }

  const COMMON_ASPECT_RATIOS = Object.freeze([
    [16, 9],
    [9, 16],
    [4, 3],
    [3, 4],
    [3, 2],
    [2, 3],
    [21, 9],
    [9, 21],
    [5, 4],
    [4, 5],
    [5, 3],
    [3, 5],
    [2, 1],
    [1, 2],
    [1, 1],
  ]);

  function gcdInt(left, right) {
    let a = Math.abs(Math.round(left));
    let b = Math.abs(Math.round(right));
    while (b) {
      const next = a % b;
      a = b;
      b = next;
    }
    return a || 1;
  }

  function formatVideoAspectRatioLabel(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!w || !h || w < 2 || h < 2) return "";
    const ratio = w / h;
    let best = "";
    let bestDiff = Infinity;
    COMMON_ASPECT_RATIOS.forEach(([aw, ah]) => {
      const diff = Math.abs(ratio - aw / ah);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = `${aw}:${ah}`;
      }
    });
    if (best && bestDiff <= 0.035) return best;
    const divisor = gcdInt(w, h);
    return `${Math.round(w / divisor)}:${Math.round(h / divisor)}`;
  }

  function splitVideoPromptSections(text) {
    const source = String(text || "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    const matches = [];
    SECTION_HEADER_PATTERN.lastIndex = 0;
    let match = SECTION_HEADER_PATTERN.exec(source);
    while (match) {
      matches.push({
        key: match[1].toLowerCase(),
        start: match.index,
        headerEnd: match.index + match[0].length,
      });
      match = SECTION_HEADER_PATTERN.exec(source);
    }
    if (!matches.length) return null;
    const sections = Object.fromEntries(VIDEO_SECTION_KEYS.map((key) => [key, ""]));
    const seen = new Set();
    for (let index = 0; index < matches.length; index += 1) {
      const entry = matches[index];
      if (seen.has(entry.key)) break;
      const next = matches[index + 1];
      const end = next ? next.start : source.length;
      sections[entry.key] = trimSectionTail(source.slice(entry.headerEnd, end));
      seen.add(entry.key);
    }
    const promptJson = buildVideoPromptJson(sections);
    return videoPromptHasContent(promptJson) ? { sections, promptJson } : null;
  }

  function looksLikeVideoPrompt(text) {
    const value = String(text || "");
    return VIDEO_SECTION_KEYS.filter((key) => new RegExp(`(?:^|[\\n"'])${key}:`, "i").test(value)).length >= 2;
  }

  function trimSectionTail(value) {
    return cleanText(String(value || "")
      .replace(/\\?"\s*,\s*\\?"(?:width|height|length|clip|vae)\\?".*$/is, "")
      .replace(/\s*\{[^{}]*$/s, "")
      .replace(/\s*"\s*,\s*"[^"]+$/s, ""));
  }

  function unescapePromptEscapes(value) {
    return String(value || "")
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t");
  }

  function collectPromptCandidatesFromValue(value, found, depth = 0) {
    if (depth > 8 || value == null) return;
    if (typeof value === "string") {
      const parsed = parseEmbeddedJson(value);
      if (parsed) {
        collectPromptCandidatesFromValue(parsed, found, depth + 1);
        return;
      }
      const text = unescapePromptEscapes(value);
      if (looksLikeVideoPrompt(text)) found.push(text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collectPromptCandidatesFromValue(entry, found, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const classType = String(value.class_type || value.type || "");
    const inputs = value.inputs && typeof value.inputs === "object" ? value.inputs : null;
    if (inputs && typeof inputs.prompt === "string" && looksLikeVideoPrompt(unescapePromptEscapes(inputs.prompt))) {
      const prompt = unescapePromptEscapes(inputs.prompt);
      found.push(classType.match(PROMPT_NODE_TYPES) ? `\u0001${prompt}` : prompt);
    }
    const widgets = value.widgets_values;
    if (Array.isArray(widgets)) collectPromptCandidatesFromValue(widgets, found, depth + 1);
    Object.values(value).forEach((entry) => collectPromptCandidatesFromValue(entry, found, depth + 1));
  }

  function sectionCoverage(text) {
    const body = String(text || "").replace(/^\u0001/, "");
    return VIDEO_SECTION_KEYS.filter((key) => new RegExp(`(?:^|\\n)${key}:`, "i").test(body)).length;
  }

  function candidateScore(text) {
    const value = String(text || "");
    const preferred = value.startsWith("\u0001") ? 6 : 0;
    const body = value.replace(/^\u0001/, "");
    const startsWithHeader = new RegExp(`^${VIDEO_SECTION_KEYS[0]}:`, "i").test(body.trim()) ? 3 : 0;
    const jsonPenalty = body.trim().startsWith("{") || /class_type|widgets_values|last_node_id/.test(body) ? -8 : 0;
    const trailerPenalty = /","(?:width|height|length)|"width"\s*:/.test(body) ? -4 : 0;
    return preferred + startsWithHeader + jsonPenalty + trailerPenalty + sectionCoverage(value);
  }

  function pickBestCandidate(candidates) {
    const unique = [...new Set((candidates || []).map((text) => String(text || "")))].filter(Boolean);
    unique.sort((left, right) => (
      candidateScore(right) - candidateScore(left)
      || sectionCoverage(right) - sectionCoverage(left)
      || right.replace(/^\u0001/, "").length - left.replace(/^\u0001/, "").length
    ));
    return unique[0] ? unique[0].replace(/^\u0001/, "") : "";
  }

  function collectFromEntries(entries) {
    const candidates = [];
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      collectPromptCandidatesFromValue(entry?.text, candidates);
    });
    return candidates;
  }

  function bestVideoPromptText(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const promptOnly = list.filter((entry) => /^prompt$/i.test(String(entry?.source || "").trim()));
    return pickBestCandidate(collectFromEntries(promptOnly))
      || pickBestCandidate(collectFromEntries(list));
  }

  function readVint(bytes, offset) {
    if (offset >= bytes.length) return null;
    const first = bytes[offset];
    let width = 1;
    let mask = 0x80;
    while (width <= 8 && (first & mask) === 0) {
      width += 1;
      mask >>= 1;
    }
    if (width > 8 || offset + width > bytes.length) return null;
    let value = first & (mask - 1);
    for (let index = 1; index < width; index += 1) value = value * 256 + bytes[offset + index];
    return { value, width };
  }

  function readEbmlId(bytes, offset) {
    const parsed = readVint(bytes, offset);
    if (!parsed) return null;
    let value = 0;
    for (let index = 0; index < parsed.width; index += 1) value = (value * 256) + bytes[offset + index];
    return { value, width: parsed.width };
  }

  function readEbmlSize(bytes, offset) {
    const parsed = readVint(bytes, offset);
    if (!parsed) return null;
    const unknown = parsed.value === (2 ** (7 * parsed.width)) - 1;
    return { value: parsed.value, width: parsed.width, unknown };
  }

  function walkEbml(bytes, start, end, visit) {
    let offset = start;
    while (offset + 2 < end) {
      const id = readEbmlId(bytes, offset);
      if (!id) break;
      const size = readEbmlSize(bytes, offset + id.width);
      if (!size) break;
      const header = id.width + size.width;
      const payloadStart = offset + header;
      const payloadEnd = size.unknown ? end : Math.min(end, payloadStart + size.value);
      if (payloadEnd < payloadStart) break;
      visit(id.value, bytes.subarray(payloadStart, payloadEnd), payloadStart, payloadEnd);
      offset = payloadEnd;
    }
  }

  function extractWebmTagEntries(bytes) {
    const entries = [];
    const visitSimpleTag = (payload) => {
      let name = "";
      let text = "";
      walkEbml(payload, 0, payload.length, (id, child) => {
        if (id === 0x45A3) name = cleanText(utf8Decoder.decode(child));
        else if (id === 0x4487) text = utf8Decoder.decode(child);
        else if (id === 0x67C8) visitSimpleTag(child);
      });
      if (name && text) entries.push({ source: name, text });
    };
    const visitTags = (payload) => {
      walkEbml(payload, 0, payload.length, (id, child) => {
        if (id === 0x7373 || id === 0x67C8 || id === 0x1254C367) {
          if (id === 0x67C8) visitSimpleTag(child);
          else visitTags(child);
        }
      });
    };
    const scan = (payload, depth) => {
      if (depth > 6) return;
      walkEbml(payload, 0, payload.length, (id, child) => {
        if (id === 0x1254C367) visitTags(child);
        else if (id === 0x18538067 || id === 0x1A45DFA3) scan(child, depth + 1);
      });
    };
    scan(bytes, 0);
    return entries;
  }

  function walkMp4Boxes(bytes, start, end, visit) {
    let offset = start;
    while (offset + 8 <= end) {
      let size = readUint32BE(bytes, offset);
      const type = ascii(bytes, offset + 4, 4);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) break;
        const high = readUint32BE(bytes, offset + 8);
        const low = readUint32BE(bytes, offset + 12);
        size = high * 0x100000000 + low;
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) break;
      visit(type, offset, size, header);
      offset += size;
    }
  }

  function extractMp4DataPayload(bytes, start, size) {
    let payload = "";
    walkMp4Boxes(bytes, start, start + size, (type, offset, boxSize, header) => {
      if (type !== "data" || boxSize <= header + 8) return;
      payload = utf8Decoder.decode(bytes.subarray(offset + header + 8, offset + boxSize));
    });
    return payload;
  }

  function extractMp4TagEntries(bytes) {
    const entries = [];
    const readKeys = (start, size) => {
      const bodyStart = start + 8;
      if (bodyStart + 8 > start + size) return [];
      const count = readUint32BE(bytes, bodyStart + 4);
      const names = [];
      let offset = bodyStart + 8;
      for (let index = 0; index < count && offset + 8 <= start + size; index += 1) {
        const entrySize = readUint32BE(bytes, offset);
        if (entrySize < 8 || offset + entrySize > start + size) break;
        names.push(cleanText(utf8Decoder.decode(bytes.subarray(offset + 8, offset + entrySize))));
        offset += entrySize;
      }
      return names;
    };
    const readIlst = (start, size, names) => {
      let index = 0;
      walkMp4Boxes(bytes, start + 8, start + size, (type, offset, boxSize, header) => {
        const key = names[index] || type;
        const text = extractMp4DataPayload(bytes, offset + header, boxSize - header);
        if (text) entries.push({ source: key || type, text });
        index += 1;
      });
    };
    const visitMeta = (start, size) => {
      const contentStart = start + 12;
      let keyNames = [];
      walkMp4Boxes(bytes, contentStart, start + size, (type, offset, boxSize) => {
        if (type === "keys") keyNames = readKeys(offset, boxSize);
      });
      walkMp4Boxes(bytes, contentStart, start + size, (type, offset, boxSize) => {
        if (type === "ilst") readIlst(offset, boxSize, keyNames);
      });
    };
    const visitContainer = (start, size, header) => {
      walkMp4Boxes(bytes, start + header, start + size, (type, offset, boxSize, childHeader) => {
        if (type === "moov" || type === "udta") visitContainer(offset, boxSize, childHeader);
        else if (type === "meta") visitMeta(offset, boxSize);
        else if (/^(prompt|work|desc|cmt )$/i.test(type)) {
          const text = utf8Decoder.decode(bytes.subarray(offset + childHeader, offset + boxSize));
          if (text) entries.push({ source: type, text });
        }
      });
    };
    walkMp4Boxes(bytes, 0, bytes.length, (type, offset, size, header) => {
      if (type === "moov") visitContainer(offset, size, header);
    });
    return entries;
  }

  function extractScannedPromptEntries(bytes) {
    const sample = utf8Decoder.decode(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)));
    const start = sample.search(/subject_definitions\s*:/i);
    if (start < 0) return [];
    const window = sample.slice(start, start + 50000);
    const parsed = splitVideoPromptSections(window.replace(/\\n/g, "\n"));
    if (!parsed) return [];
    return [{ source: "raw-scan", text: VIDEO_SECTION_KEYS.map((key) => `${key}:\n${parsed.sections[key] || ""}`).join("\n\n") }];
  }

  function extractVideoMetadataEntries(value) {
    const bytes = toBytes(value);
    if (bytes.length >= 4 && ascii(bytes, 0, 4) === "\u001aEß£") {
      const tags = extractWebmTagEntries(bytes);
      return tags.length ? tags : extractScannedPromptEntries(bytes);
    }
    if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
      const tags = extractMp4TagEntries(bytes);
      return tags.length ? tags : extractScannedPromptEntries(bytes);
    }
    if (bytes.length >= 4 && ascii(bytes, 0, 4) === "RIFF") {
      return extractScannedPromptEntries(bytes);
    }
    return extractWebmTagEntries(bytes).concat(extractMp4TagEntries(bytes), extractScannedPromptEntries(bytes));
  }

  function resolveVideoPrompt(entries) {
    const text = bestVideoPromptText(entries);
    const split = splitVideoPromptSections(text);
    if (!split) return null;
    const source = (Array.isArray(entries) ? entries : [])
      .map((entry) => String(entry?.source || "").toLowerCase())
      .find((name) => /prompt|workflow|comment|description|raw-scan/.test(name)) || "metadata";
    return {
      promptJson: split.promptJson,
      sections: split.sections,
      rawText: text,
      source,
    };
  }

  function resolveVideoPromptFromBytes(value) {
    return resolveVideoPrompt(extractVideoMetadataEntries(value));
  }

  return {
    VIDEO_SECTION_KEYS,
    VIDEO_SECTION_META,
    buildVideoPromptJson,
    extractVideoMetadataEntries,
    resolveVideoPrompt,
    resolveVideoPromptFromBytes,
    splitVideoPromptSections,
    videoPromptHasContent,
    formatVideoDurationLabel,
    formatVideoAspectRatioLabel,
  };
});
