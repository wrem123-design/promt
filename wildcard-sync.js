"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const STATE_VERSION = 1;
const SCENARIO_SECTIONS = ["outfit", "background", "expression_pose", "details"];

function normalizeWildcardLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function sectionText(item, sectionKey) {
  const sentences = item?.promptJson?.[sectionKey]?.sentences;
  if (!Array.isArray(sentences)) return "";
  return normalizeWildcardLine(sentences.map((sentence) => sentence?.en || "").filter(Boolean).join(" "));
}

function buildWildcardRecord(item) {
  const id = String(item?.id || "").trim();
  const appearance = sectionText(item, "appearance");
  const scenarioParts = SCENARIO_SECTIONS.map((sectionKey) => sectionText(item, sectionKey));
  if (!id || !appearance || scenarioParts.some((part) => !part)) return null;
  return { id, appearance, scenario: normalizeWildcardLine(scenarioParts.join(" ")) };
}

function lineHash(value) {
  return crypto.createHash("sha256").update(normalizeWildcardLine(value), "utf8").digest("hex");
}

function linesFromText(value) {
  return String(value || "").split(/\r?\n/).map(normalizeWildcardLine).filter(Boolean);
}

function appendLines(original, additions) {
  if (!additions.length) return original;
  const separator = original.length && !/[\r\n]$/.test(original) ? "\n" : "";
  return `${original}${separator}${additions.join("\n")}\n`;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function atomicWriteFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tempPath, value, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function replaceWildcardFiles(changes) {
  const active = changes.filter((change) => change.original !== change.updated);
  if (!active.length) return;
  const stamp = `${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}`;
  const staged = [];
  try {
    for (const change of active) {
      const tempPath = `${change.filePath}.${stamp}.tmp`;
      const backupPath = `${change.filePath}.${stamp}.rollback`;
      const existed = await pathExists(change.filePath);
      await fs.writeFile(tempPath, change.updated, "utf8");
      if (existed) await fs.copyFile(change.filePath, backupPath);
      staged.push({ ...change, tempPath, backupPath, existed, replaced: false });
    }
    for (const entry of staged) {
      await fs.rename(entry.tempPath, entry.filePath);
      entry.replaced = true;
    }
  } catch (error) {
    for (const entry of staged.filter((value) => value.replaced).reverse()) {
      if (entry.existed) await fs.copyFile(entry.backupPath, entry.filePath).catch(() => {});
      else await fs.rm(entry.filePath, { force: true }).catch(() => {});
    }
    throw error;
  } finally {
    for (const entry of staged) {
      await fs.rm(entry.tempPath, { force: true }).catch(() => {});
      await fs.rm(entry.backupPath, { force: true }).catch(() => {});
    }
  }
}

function wildcardLinesText(lines) {
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function processedEntry(record, processedAt) {
  return {
    appearanceHash: lineHash(record.appearance),
    scenarioHash: lineHash(record.scenario),
    processedAt,
  };
}

async function defaultRefreshWildcards(refreshUrl) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const target = new URL(refreshUrl);
      const client = target.protocol === "https:" ? https : http;
      const request = client.get(target, { timeout: 2500 }, (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 300) {
          finish({ refreshed: true, message: "ComfyUI 와일드카드 목록을 새로고침했습니다." });
        } else {
          finish({ refreshed: false, message: `ComfyUI 새로고침 응답: HTTP ${response.statusCode}` });
        }
      });
      request.on("timeout", () => request.destroy(new Error("timeout")));
      request.on("error", () => finish({ refreshed: false, message: "ComfyUI가 꺼져 있어 목록 새로고침은 건너뛰었습니다." }));
    } catch {
      finish({ refreshed: false, message: "ComfyUI 새로고침 주소가 올바르지 않습니다." });
    }
  });
}

async function syncWildcards(options) {
  const {
    itemsPath,
    statePath,
    wildcardDir,
    refreshUrl = "http://127.0.0.1:8188/impact/wildcards/refresh",
    refreshWildcards = () => defaultRefreshWildcards(refreshUrl),
    now = () => new Date().toISOString(),
  } = options;
  const appearancePath = path.join(wildcardDir, "appearance.txt");
  const scenarioPath = path.join(wildcardDir, "scenario.txt");
  const [itemsSource, appearanceSource, scenarioSource] = await Promise.all([
    fs.readFile(itemsPath, "utf8"),
    fs.readFile(appearancePath, "utf8"),
    fs.readFile(scenarioPath, "utf8"),
  ]);
  const items = JSON.parse(itemsSource);
  if (!Array.isArray(items)) throw new Error("items.json의 최상위 값이 배열이 아닙니다.");
  const updatedAt = now();
  const stateExists = await pathExists(statePath);

  if (!stateExists) {
    const processedItems = Object.create(null);
    let invalidItems = 0;
    for (const item of items) {
      const record = buildWildcardRecord(item);
      if (!record) {
        invalidItems += 1;
        continue;
      }
      processedItems[record.id] = processedEntry(record, updatedAt);
    }
    await atomicWriteFile(statePath, JSON.stringify({
      version: STATE_VERSION,
      initializedAt: updatedAt,
      updatedAt,
      processedItems,
    }, null, 2));
    const refresh = await refreshWildcards();
    return {
      initialized: true,
      totalItems: items.length,
      previouslyProcessed: 0,
      newItems: 0,
      appearanceAdded: 0,
      scenarioAdded: 0,
      duplicatesSkipped: 0,
      invalidItems,
      refreshed: Boolean(refresh?.refreshed),
      refreshMessage: refresh?.message || "",
      updatedAt,
    };
  }

  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  if (!state || state.version !== STATE_VERSION || !state.processedItems || typeof state.processedItems !== "object" || Array.isArray(state.processedItems)) {
    throw new Error("와일드카드 업데이트 기록 파일 형식이 올바르지 않습니다.");
  }
  const previouslyProcessed = Object.keys(state.processedItems).length;
  const appearanceHashes = new Set(linesFromText(appearanceSource).map(lineHash));
  const scenarioHashes = new Set(linesFromText(scenarioSource).map(lineHash));
  const appearanceAdditions = [];
  const scenarioAdditions = [];
  let newItems = 0;
  let duplicatesSkipped = 0;
  let invalidItems = 0;

  for (const item of items) {
    const id = String(item?.id || "").trim();
    if (id && Object.prototype.hasOwnProperty.call(state.processedItems, id)) continue;
    newItems += 1;
    const record = buildWildcardRecord(item);
    if (!record) {
      invalidItems += 1;
      continue;
    }
    const appearanceHash = lineHash(record.appearance);
    const scenarioHash = lineHash(record.scenario);
    if (appearanceHashes.has(appearanceHash)) {
      duplicatesSkipped += 1;
    } else {
      appearanceHashes.add(appearanceHash);
      appearanceAdditions.push(record.appearance);
    }
    if (scenarioHashes.has(scenarioHash)) {
      duplicatesSkipped += 1;
    } else {
      scenarioHashes.add(scenarioHash);
      scenarioAdditions.push(record.scenario);
    }
    state.processedItems[record.id] = processedEntry(record, updatedAt);
  }

  await replaceWildcardFiles([
    { filePath: appearancePath, original: appearanceSource, updated: appendLines(appearanceSource, appearanceAdditions) },
    { filePath: scenarioPath, original: scenarioSource, updated: appendLines(scenarioSource, scenarioAdditions) },
  ]);
  state.updatedAt = updatedAt;
  await atomicWriteFile(statePath, JSON.stringify(state, null, 2));
  const refresh = await refreshWildcards();
  return {
    initialized: false,
    totalItems: items.length,
    previouslyProcessed,
    newItems,
    appearanceAdded: appearanceAdditions.length,
    scenarioAdded: scenarioAdditions.length,
    duplicatesSkipped,
    invalidItems,
    refreshed: Boolean(refresh?.refreshed),
    refreshMessage: refresh?.message || "",
    updatedAt,
  };
}

async function rebuildWildcards(options) {
  const {
    itemsPath,
    statePath,
    wildcardDir,
    refreshUrl = "http://127.0.0.1:8188/impact/wildcards/refresh",
    refreshWildcards = () => defaultRefreshWildcards(refreshUrl),
    now = () => new Date().toISOString(),
  } = options;
  const appearancePath = path.join(wildcardDir, "appearance.txt");
  const scenarioPath = path.join(wildcardDir, "scenario.txt");
  const [itemsSource, appearanceSource, scenarioSource, previousStateSource] = await Promise.all([
    fs.readFile(itemsPath, "utf8"),
    fs.readFile(appearancePath, "utf8"),
    fs.readFile(scenarioPath, "utf8"),
    fs.readFile(statePath, "utf8").catch(() => ""),
  ]);
  const items = JSON.parse(itemsSource);
  if (!Array.isArray(items)) throw new Error("items.json의 최상위 값이 배열이 아닙니다.");

  const updatedAt = now();
  const processedItems = Object.create(null);
  const appearanceHashes = new Set();
  const scenarioHashes = new Set();
  const appearanceLines = [];
  const scenarioLines = [];
  let validItems = 0;
  let invalidItems = 0;
  let duplicatesSkipped = 0;

  for (const item of items) {
    const record = buildWildcardRecord(item);
    if (!record) {
      invalidItems += 1;
      continue;
    }
    validItems += 1;
    processedItems[record.id] = processedEntry(record, updatedAt);
    const appearanceHash = lineHash(record.appearance);
    const scenarioHash = lineHash(record.scenario);
    if (appearanceHashes.has(appearanceHash)) duplicatesSkipped += 1;
    else {
      appearanceHashes.add(appearanceHash);
      appearanceLines.push(record.appearance);
    }
    if (scenarioHashes.has(scenarioHash)) duplicatesSkipped += 1;
    else {
      scenarioHashes.add(scenarioHash);
      scenarioLines.push(record.scenario);
    }
  }

  const nextAppearanceSource = wildcardLinesText(appearanceLines);
  const nextScenarioSource = wildcardLinesText(scenarioLines);
  const nextStateSource = JSON.stringify({
    version: STATE_VERSION,
    initializedAt: updatedAt,
    updatedAt,
    processedItems,
  }, null, 2);
  await replaceWildcardFiles([
    { filePath: appearancePath, original: appearanceSource, updated: nextAppearanceSource },
    { filePath: scenarioPath, original: scenarioSource, updated: nextScenarioSource },
    { filePath: statePath, original: previousStateSource, updated: nextStateSource },
  ]);
  const refresh = await refreshWildcards();
  return {
    rebuilt: true,
    totalItems: items.length,
    validItems,
    invalidItems,
    appearanceWritten: appearanceLines.length,
    scenarioWritten: scenarioLines.length,
    previousAppearanceLines: linesFromText(appearanceSource).length,
    previousScenarioLines: linesFromText(scenarioSource).length,
    duplicatesSkipped,
    refreshed: Boolean(refresh?.refreshed),
    refreshMessage: refresh?.message || "",
    updatedAt,
  };
}

module.exports = {
  buildWildcardRecord,
  defaultRefreshWildcards,
  normalizeWildcardLine,
  rebuildWildcards,
  syncWildcards,
};
