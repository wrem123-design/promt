(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PromptArchiveImageConverter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const utf8Encoder = new TextEncoder();
  const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
  const latin1Decoder = new TextDecoder("latin1", { fatal: false });

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError("바이트 배열이 필요합니다.");
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

  function readUint32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function writeUint24LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
  }

  function writeUint32LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function writeUint16LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  }

  function findNull(bytes, start) {
    const index = bytes.indexOf(0, start);
    return index >= 0 ? index : bytes.length;
  }

  async function inflateZlib(bytes) {
    if (typeof DecompressionStream !== "function") return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function extractPngMetadata(pngValue) {
    const png = toBytes(pngValue);
    if (png.length < 8 || ascii(png, 1, 3) !== "PNG") throw new Error("올바른 PNG 파일이 아닙니다.");
    const entries = [];
    let originalExif = null;
    let offset = 8;

    while (offset + 12 <= png.length) {
      const size = readUint32BE(png, offset);
      const type = ascii(png, offset + 4, 4);
      const start = offset + 8;
      const end = start + size;
      if (end + 4 > png.length) throw new Error("손상된 PNG 청크를 발견했습니다.");
      const data = png.slice(start, end);

      if (type === "tEXt") {
        const nul = findNull(data, 0);
        entries.push({
          source: latin1Decoder.decode(data.slice(0, nul)) || "PNG tEXt",
          text: latin1Decoder.decode(data.slice(Math.min(nul + 1, data.length))),
        });
      } else if (type === "iTXt") {
        const keywordEnd = findNull(data, 0);
        const source = utf8Decoder.decode(data.slice(0, keywordEnd)) || "PNG iTXt";
        let cursor = Math.min(keywordEnd + 1, data.length);
        const compressed = data[cursor] === 1;
        cursor += 2;
        cursor = Math.min(findNull(data, cursor) + 1, data.length);
        cursor = Math.min(findNull(data, cursor) + 1, data.length);
        let textBytes = data.slice(cursor);
        if (compressed) textBytes = (await inflateZlib(textBytes)) || new Uint8Array();
        entries.push({ source, text: utf8Decoder.decode(textBytes) });
      } else if (type === "zTXt") {
        const keywordEnd = findNull(data, 0);
        const source = latin1Decoder.decode(data.slice(0, keywordEnd)) || "PNG zTXt";
        const compressed = data.slice(Math.min(keywordEnd + 2, data.length));
        const inflated = await inflateZlib(compressed);
        entries.push({ source, text: inflated ? latin1Decoder.decode(inflated) : "" });
      } else if (type === "eXIf" && data.length) {
        originalExif = data;
      }

      offset = end + 4;
      if (type === "IEND") break;
    }

    return {
      entries: entries.filter((entry) => entry.text.length > 0),
      originalExif,
    };
  }

  function encodeUtf16Be(value) {
    const text = String(value);
    const bytes = new Uint8Array(text.length * 2);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      bytes[index * 2] = (code >>> 8) & 0xff;
      bytes[index * 2 + 1] = code & 0xff;
    }
    return bytes;
  }

  function buildExifUserComment(value) {
    const text = encodeUtf16Be(value);
    const comment = new Uint8Array(8 + text.length + 2);
    comment.set([0x55, 0x4e, 0x49, 0x43, 0x4f, 0x44, 0x45, 0x00], 0); // UNICODE\0
    comment.set(text, 8);

    const ifd0Offset = 8;
    const exifIfdOffset = 26;
    const commentOffset = 44;
    const tiff = new Uint8Array(commentOffset + comment.length);
    tiff.set([0x49, 0x49, 0x2a, 0x00], 0);
    writeUint32LE(tiff, 4, ifd0Offset);

    writeUint16LE(tiff, ifd0Offset, 1);
    writeUint16LE(tiff, ifd0Offset + 2, 0x8769);
    writeUint16LE(tiff, ifd0Offset + 4, 4);
    writeUint32LE(tiff, ifd0Offset + 6, 1);
    writeUint32LE(tiff, ifd0Offset + 10, exifIfdOffset);
    writeUint32LE(tiff, ifd0Offset + 14, 0);

    writeUint16LE(tiff, exifIfdOffset, 1);
    writeUint16LE(tiff, exifIfdOffset + 2, 0x9286);
    writeUint16LE(tiff, exifIfdOffset + 4, 7);
    writeUint32LE(tiff, exifIfdOffset + 6, comment.length);
    writeUint32LE(tiff, exifIfdOffset + 10, commentOffset);
    writeUint32LE(tiff, exifIfdOffset + 14, 0);
    tiff.set(comment, commentOffset);
    return tiff;
  }

  function parseWebpChunks(webpValue) {
    const webp = toBytes(webpValue);
    if (webp.length < 12 || ascii(webp, 0, 4) !== "RIFF" || ascii(webp, 8, 4) !== "WEBP") {
      throw new Error("올바른 WebP 파일이 아닙니다.");
    }
    const chunks = [];
    let offset = 12;
    while (offset + 8 <= webp.length) {
      const type = ascii(webp, offset, 4);
      const size = readUint32LE(webp, offset + 4);
      const start = offset + 8;
      const end = start + size;
      if (end > webp.length) throw new Error("손상된 WebP 청크를 발견했습니다.");
      chunks.push({ type, data: webp.slice(start, end) });
      offset = end + (size % 2);
    }
    return chunks;
  }

  function makeChunk(type, value) {
    const data = toBytes(value);
    const chunk = new Uint8Array(8 + data.length + (data.length % 2));
    for (let index = 0; index < 4; index += 1) chunk[index] = type.charCodeAt(index);
    writeUint32LE(chunk, 4, data.length);
    chunk.set(data, 8);
    return chunk;
  }

  function hasWebpAlpha(chunks) {
    if (chunks.some((chunk) => chunk.type === "ALPH")) return true;
    const lossless = chunks.find((chunk) => chunk.type === "VP8L");
    if (!lossless || lossless.data.length < 5 || lossless.data[0] !== 0x2f) return false;
    const bits = readUint32LE(lossless.data, 1);
    return Boolean((bits >>> 28) & 1);
  }

  function buildRiff(chunks) {
    const encoded = chunks.map((chunk) => makeChunk(chunk.type, chunk.data));
    const length = 12 + encoded.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Uint8Array(length);
    result.set([0x52, 0x49, 0x46, 0x46], 0);
    writeUint32LE(result, 4, length - 8);
    result.set([0x57, 0x45, 0x42, 0x50], 8);
    let offset = 12;
    for (const chunk of encoded) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  async function preservePngMetadataInWebp(webpValue, pngValue, width, height) {
    const sourceChunks = parseWebpChunks(webpValue);
    const metadata = await extractPngMetadata(pngValue);
    const payload = metadata.entries.length
      ? JSON.stringify({ format: "prompt-archive-png-metadata", version: 1, entries: metadata.entries })
      : "";
    const exif = metadata.originalExif || (payload ? buildExifUserComment(payload) : null);
    const xmp = payload ? utf8Encoder.encode(payload) : null;

    if (!exif && !xmp) {
      return { bytes: toBytes(webpValue), metadataEntryCount: 0, hasExif: false, hasXmp: false };
    }

    const filtered = sourceChunks.filter((chunk) => chunk.type !== "EXIF" && chunk.type !== "XMP ");
    let vp8x = filtered.find((chunk) => chunk.type === "VP8X");
    if (!vp8x) {
      vp8x = { type: "VP8X", data: new Uint8Array(10) };
      filtered.unshift(vp8x);
    } else if (vp8x.data.length < 10) {
      vp8x.data = new Uint8Array(10);
    } else {
      vp8x.data = vp8x.data.slice();
    }

    const hasIcc = filtered.some((chunk) => chunk.type === "ICCP");
    const hasAnimation = filtered.some((chunk) => chunk.type === "ANIM");
    vp8x.data[0] = (hasIcc ? 0x20 : 0)
      | (hasWebpAlpha(filtered) ? 0x10 : 0)
      | (exif ? 0x08 : 0)
      | (xmp ? 0x04 : 0)
      | (hasAnimation ? 0x02 : 0);
    writeUint24LE(vp8x.data, 4, Math.max(0, Number(width) - 1));
    writeUint24LE(vp8x.data, 7, Math.max(0, Number(height) - 1));
    if (exif) filtered.push({ type: "EXIF", data: exif });
    if (xmp) filtered.push({ type: "XMP ", data: xmp });

    return {
      bytes: buildRiff(filtered),
      metadataEntryCount: metadata.entries.length,
      hasExif: Boolean(exif),
      hasXmp: Boolean(xmp),
    };
  }

  return {
    buildExifUserComment,
    extractPngMetadata,
    parseWebpChunks,
    preservePngMetadataInWebp,
  };
});
