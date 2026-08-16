(function (root, factory) {
  const converter = typeof module === "object" && module.exports
    ? require("./image-converter.js")
    : root.PromptArchiveImageConverter;
  const api = factory(converter);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptArchiveLoraSorter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (imageConverter) {
  "use strict";

  const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
  const latin1Decoder = new TextDecoder("latin1", { fatal: false });

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError("이미지 바이트 배열이 필요합니다.");
  }

  function ascii(bytes, offset, length) {
    let value = "";
    for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
      value += String.fromCharCode(bytes[offset + index]);
    }
    return value;
  }

  function readUint16(bytes, offset, little) {
    if (offset < 0 || offset + 2 > bytes.length) return 0;
    return little
      ? bytes[offset] | (bytes[offset + 1] << 8)
      : (bytes[offset] << 8) | bytes[offset + 1];
  }

  function readUint32(bytes, offset, little) {
    if (offset < 0 || offset + 4 > bytes.length) return 0;
    if (little) {
      return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    }
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ")
      .trim();
  }

  function parseJsonText(value) {
    const text = cleanText(value);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_nestedError) {
        return null;
      }
    }
  }

  function decodeUtf16(bytes, little) {
    let result = "";
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      const code = little
        ? bytes[index] | (bytes[index + 1] << 8)
        : (bytes[index] << 8) | bytes[index + 1];
      if (code) result += String.fromCharCode(code);
    }
    return result;
  }

  function decodeExifValue(tiff, inlineOffset, type, count, valueOffset, little) {
    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 7: 1 }[type] || 1;
    const length = count * typeSize;
    const start = length <= 4 ? inlineOffset : valueOffset;
    if (!Number.isSafeInteger(length) || length < 0 || start < 0 || start + length > tiff.length) return "";
    const data = tiff.slice(start, start + length);
    if (type === 2) return latin1Decoder.decode(data).replace(/\0+$/g, "");
    if (type === 7) {
      const prefix = ascii(data, 0, 8);
      const body = data.slice(8);
      if (prefix.startsWith("UNICODE")) return decodeUtf16(body, false);
      if (prefix.startsWith("ASCII")) return latin1Decoder.decode(body).replace(/\0+$/g, "");
    }
    if (type === 3 && length > 4) return decodeUtf16(data, little);
    return utf8Decoder.decode(data).replace(/\0+$/g, "");
  }

  function extractExifEntries(value) {
    let tiff = toBytes(value);
    if (ascii(tiff, 0, 6) === "Exif\0\0") tiff = tiff.slice(6);
    if (tiff.length < 8) return [];
    const marker = ascii(tiff, 0, 2);
    if (marker !== "II" && marker !== "MM") return [];
    const little = marker === "II";
    if (readUint16(tiff, 2, little) !== 42) return [];
    const entries = [];
    const visited = new Set();
    const names = {
      0x010e: "ImageDescription",
      0x010f: "Make",
      0x0110: "Model",
      0x0131: "Software",
      0x9286: "UserComment",
      0x9c9b: "XPTitle",
      0x9c9c: "XPComment",
      0x9c9e: "XPSubject",
    };
    const parseIfd = (offset) => {
      if (!offset || visited.has(offset) || offset + 2 > tiff.length) return;
      visited.add(offset);
      const count = readUint16(tiff, offset, little);
      if (count > 4096) return;
      for (let index = 0; index < count; index += 1) {
        const entryOffset = offset + 2 + index * 12;
        if (entryOffset + 12 > tiff.length) break;
        const tag = readUint16(tiff, entryOffset, little);
        const type = readUint16(tiff, entryOffset + 2, little);
        const valueCount = readUint32(tiff, entryOffset + 4, little);
        const valueOffset = readUint32(tiff, entryOffset + 8, little);
        if (tag === 0x8769 || tag === 0x8825) {
          parseIfd(valueOffset);
        } else if (names[tag]) {
          const text = cleanText(decodeExifValue(tiff, entryOffset + 8, type, valueCount, valueOffset, little));
          if (text) entries.push({ source: names[tag], text });
        }
      }
      const nextOffset = offset + 2 + count * 12;
      if (nextOffset + 4 <= tiff.length) parseIfd(readUint32(tiff, nextOffset, little));
    };
    parseIfd(readUint32(tiff, 4, little));
    return entries;
  }

  function flattenMetadataEntries(entries) {
    const flattened = [];
    const visit = (entry, depth) => {
      if (!entry || depth > 3) return;
      const text = cleanText(entry.text);
      if (!text) return;
      const parsed = parseJsonText(text);
      if (parsed?.format === "prompt-archive-png-metadata" && Array.isArray(parsed.entries)) {
        parsed.entries.forEach((nested) => visit(nested, depth + 1));
        return;
      }
      flattened.push({ source: String(entry.source || "metadata"), text });
    };
    (Array.isArray(entries) ? entries : []).forEach((entry) => visit(entry, 0));
    return flattened;
  }

  function extractWebpEntries(bytes) {
    if (!imageConverter?.parseWebpChunks) throw new Error("WebP 메타데이터 판독기를 불러오지 못했습니다.");
    const entries = [];
    for (const chunk of imageConverter.parseWebpChunks(bytes)) {
      if (chunk.type === "EXIF") entries.push(...extractExifEntries(chunk.data));
      if (chunk.type === "XMP ") entries.push({ source: "WebP XMP", text: utf8Decoder.decode(chunk.data) });
    }
    return flattenMetadataEntries(entries);
  }

  function extractPngEntries(bytes) {
    const entries = [];
    if (bytes.length < 8 || ascii(bytes, 1, 3) !== "PNG") return entries;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = readUint32(bytes, offset, false);
      const type = ascii(bytes, offset + 4, 4);
      const start = offset + 8;
      const end = start + length;
      if (end + 4 > bytes.length) break;
      const data = bytes.slice(start, end);
      if (type === "tEXt") {
        const nul = data.indexOf(0);
        entries.push({
          source: nul >= 0 ? latin1Decoder.decode(data.slice(0, nul)) : "PNG tEXt",
          text: latin1Decoder.decode(data.slice(nul >= 0 ? nul + 1 : 0)),
        });
      } else if (type === "iTXt") {
        const keywordEnd = data.indexOf(0);
        let cursor = keywordEnd >= 0 ? keywordEnd + 1 : data.length;
        const compressed = data[cursor] === 1;
        cursor += 2;
        for (let field = 0; field < 2; field += 1) {
          const endField = data.indexOf(0, cursor);
          cursor = endField >= 0 ? endField + 1 : data.length;
        }
        if (!compressed) entries.push({
          source: keywordEnd >= 0 ? utf8Decoder.decode(data.slice(0, keywordEnd)) : "PNG iTXt",
          text: utf8Decoder.decode(data.slice(cursor)),
        });
      } else if (type === "eXIf") {
        entries.push(...extractExifEntries(data));
      }
      offset = end + 4;
      if (type === "IEND") break;
    }
    return flattenMetadataEntries(entries);
  }

  function extractJpegEntries(bytes) {
    const entries = [];
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return entries;
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = readUint16(bytes, offset, false);
      const start = offset + 2;
      const end = start + length - 2;
      if (length < 2 || end > bytes.length) break;
      const data = bytes.slice(start, end);
      if (marker === 0xe1 && ascii(data, 0, 6) === "Exif\0\0") entries.push(...extractExifEntries(data));
      offset = end;
    }
    return flattenMetadataEntries(entries);
  }

  function imageMetadataEntries(value, mimeType = "") {
    const bytes = toBytes(value);
    const mime = String(mimeType || "").toLowerCase();
    if (mime.includes("webp") || (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")) return extractWebpEntries(bytes);
    if (mime.includes("png") || ascii(bytes, 1, 3) === "PNG") return extractPngEntries(bytes);
    if (mime.includes("jpeg") || mime.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8)) return extractJpegEntries(bytes);
    return [];
  }

  function isPowerLoaderNode(node) {
    const classType = String(node?.class_type || node?.type || "").toLowerCase();
    const title = String(node?._meta?.title || node?.title || "").toLowerCase();
    return (classType.includes("power lora loader") || title.includes("power lora loader"))
      && (classType.includes("rgthree") || title.includes("rgthree"));
  }

  function loraName(path) {
    const file = String(path || "").split(/[\\/]/).pop() || "";
    return file.replace(/\.(?:safetensors|ckpt|pt)$/i, "") || file;
  }

  function enabledLorasFromNode(node, nodeId) {
    const candidates = [];
    const pending = [{ value: node.inputs || node.widgets_values || {}, depth: 0 }];
    while (pending.length) {
      const { value, depth } = pending.pop();
      if (!value || typeof value !== "object" || depth > 12) continue;
      if (!Array.isArray(value) && value.on === true && typeof value.lora === "string") {
        candidates.push({
          path: value.lora.slice(0, 1024),
          name: loraName(value.lora.slice(0, 1024)),
          strength: Number.isFinite(Number(value.strength)) ? Number(value.strength) : 1,
          nodeId: String(nodeId || node.id || ""),
        });
        continue;
      }
      const children = Object.values(value);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push({ value: children[index], depth: depth + 1 });
      }
    }
    return candidates;
  }

  function graphNodes(parsed) {
    if (!parsed || typeof parsed !== "object") return [];
    if (Array.isArray(parsed.nodes)) return parsed.nodes.map((node) => [String(node.id || ""), node]);
    if (Array.isArray(parsed) || parsed.format === "prompt-archive-png-metadata") return [];
    return Object.entries(parsed).filter(([, node]) => node && typeof node === "object" && !Array.isArray(node));
  }

  function findActivePowerLoras(entries) {
    const found = [];
    for (const entry of flattenMetadataEntries(entries)) {
      const parsed = parseJsonText(entry.text);
      for (const [nodeId, node] of graphNodes(parsed)) {
        if (isPowerLoaderNode(node)) found.push(...enabledLorasFromNode(node, nodeId));
      }
    }
    const unique = new Map();
    for (const lora of found) {
      const key = lora.path.replace(/\//g, "\\").toLowerCase();
      if (!unique.has(key)) unique.set(key, lora);
    }
    return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }));
  }

  function inspectMetadataEntries(entries) {
    const flattened = flattenMetadataEntries(entries);
    let graphFound = false;
    for (const entry of flattened) {
      if (graphNodes(parseJsonText(entry.text)).length) {
        graphFound = true;
        break;
      }
    }
    const loras = findActivePowerLoras(flattened);
    if (loras.length) return { status: "matched", loras };
    if (graphFound) return { status: "none", loras: [] };
    return { status: "unreadable", loras: [] };
  }

  function inspectImageMetadata(value, mimeType = "") {
    try {
      return inspectMetadataEntries(imageMetadataEntries(value, mimeType));
    } catch (error) {
      return { status: "unreadable", loras: [], error: error?.message || String(error) };
    }
  }

  function normalizedLoraPath(value) {
    return String(value || "").replace(/\//g, "\\").toLowerCase();
  }

  function normalizeLoraExclusion(value) {
    return loraName(String(value || "").trim()).trim();
  }

  function loraExclusionKey(value) {
    return normalizeLoraExclusion(value).toLowerCase();
  }

  function loraExclusionKeys(values) {
    const entries = typeof values === "string"
      ? [values]
      : values && typeof values[Symbol.iterator] === "function" ? values : [];
    return new Set([...entries].map(loraExclusionKey).filter(Boolean));
  }

  function isLoraDetectionExcluded(lora, excludedValues) {
    const value = typeof lora === "string" ? lora : lora?.path || lora?.name;
    return loraExclusionKeys(excludedValues).has(loraExclusionKey(value));
  }

  function classificationForInspection(inspection, detectionExcludedLoras = []) {
    if (inspection?.status === "matched" && inspection.loras?.length) {
      const excludedKeys = loraExclusionKeys(detectionExcludedLoras);
      const loras = inspection.loras
        .filter((entry) => !excludedKeys.has(loraExclusionKey(entry?.path || entry?.name)))
        .sort((left, right) => normalizedLoraPath(left.path).localeCompare(normalizedLoraPath(right.path)));
      if (!loras.length) {
        return { key: "__excluded_loras_only__", label: "감지 제외 LoRA만 있음", kind: "excluded-only" };
      }
      return {
        key: loras.map((entry) => normalizedLoraPath(entry.path)).join("+"),
        label: loras.map((entry) => entry.name || loraName(entry.path)).join(" + "),
        kind: loras.length > 1 ? "multiple" : "single",
      };
    }
    if (inspection?.status === "none") return { key: "__no_active_lora__", label: "활성 Power LoRA 없음", kind: "none" };
    return { key: "__unreadable__", label: "메타데이터 판독 불가", kind: "unreadable" };
  }

  function safeFolderName(value) {
    const base = loraName(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
      .replace(/[.\s_]+$/g, "")
      .replace(/^\.+/g, "")
      .trim();
    return base || "LoRA_분류";
  }

  function isSupportedImageName(value) {
    return /\.(?:webp|png|jpe?g)$/i.test(String(value || ""));
  }

  function groupInspectedFiles(files, detectionExcludedLoras = []) {
    const grouped = new Map();
    for (const file of Array.isArray(files) ? files : []) {
      const classification = file?.inspection
        ? classificationForInspection(file.inspection, detectionExcludedLoras)
        : file?.classification || classificationForInspection(file?.inspection, detectionExcludedLoras);
      if (!grouped.has(classification.key)) {
        grouped.set(classification.key, {
          ...classification,
          count: 0,
          files: [],
          movable: classification.kind === "single" || classification.kind === "multiple",
        });
      }
      const group = grouped.get(classification.key);
      group.count += 1;
      group.files.push(file);
    }
    return [...grouped.values()]
      .map((group) => ({
        ...group,
        files: group.files.sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ko")),
      }))
      .sort((left, right) => Number(right.movable) - Number(left.movable)
        || right.count - left.count
        || left.label.localeCompare(right.label, "ko"));
  }

  function collisionFileName(fileName, attempt) {
    const value = String(fileName || "");
    const index = Math.max(0, Math.trunc(Number(attempt) || 0));
    if (!index) return value;
    const dot = value.lastIndexOf(".");
    const hasExtension = dot > 0;
    const base = hasExtension ? value.slice(0, dot) : value;
    const extension = hasExtension ? value.slice(dot) : "";
    return `${base}_${index + 1}${extension}`;
  }

  return {
    classificationForInspection,
    collisionFileName,
    extractExifEntries,
    findActivePowerLoras,
    groupInspectedFiles,
    imageMetadataEntries,
    inspectImageMetadata,
    inspectMetadataEntries,
    isLoraDetectionExcluded,
    isSupportedImageName,
    normalizeLoraExclusion,
    safeFolderName,
  };
});
