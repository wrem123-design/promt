"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const STATE_VERSION = 2;
const SCENARIO_SECTIONS = ["outfit", "background", "expression_pose", "details"];
const DEFAULT_WILDCARD_SETTINGS = Object.freeze({
  appearancePath: "appearance.txt",
  defaultScenarioPath: "scenario.txt",
  rules: Object.freeze([Object.freeze({
    id: "nsfw",
    name: "NSFW",
    categoryNames: Object.freeze(["nsfw"]),
    outputPath: "nsfw.txt",
    enabled: true,
  })]),
});
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function normalizedCategoryName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeWildcardRelativePath(value, fieldName) {
  const normalized = String(value || "").trim().replace(/\\/g, "/");
  const segments = normalized.split("/");
  const hasInvalidSegment = segments.some((segment) => (
    !segment
    || segment === "."
    || segment === ".."
    || /[<>:"|?*\u0000-\u001f]/.test(segment)
    || /[ .]$/.test(segment)
    || WINDOWS_RESERVED_NAME.test(segment)
  ));
  if (
    !normalized
    || path.posix.isAbsolute(normalized)
    || path.win32.isAbsolute(normalized)
    || /^[a-z]:/i.test(normalized)
    || hasInvalidSegment
  ) {
    throw new Error(`${fieldName}은(는) 와일드카드 폴더 안의 안전한 상대 경로여야 합니다.`);
  }
  if (!/\.txt$/i.test(normalized)) {
    throw new Error(`${fieldName}은(는) .txt 파일이어야 합니다.`);
  }
  return segments.join("/");
}

/**
 * Validates and normalizes user-configurable wildcard output rules.
 *
 * @param {object} [input] Saved wildcard settings.
 * @returns {object} Safe paths and ordered category rules.
 * @throws {Error} If a path, rule condition, or destination conflicts.
 */
function normalizeWildcardSettings(input) {
  const source = input && typeof input === "object" ? input : DEFAULT_WILDCARD_SETTINGS;
  const appearancePath = normalizeWildcardRelativePath(
    source.appearancePath || DEFAULT_WILDCARD_SETTINGS.appearancePath,
    "외모 저장 경로",
  );
  const defaultScenarioPath = normalizeWildcardRelativePath(
    source.defaultScenarioPath || DEFAULT_WILDCARD_SETTINGS.defaultScenarioPath,
    "기본 시나리오 저장 경로",
  );
  const rawRules = Array.isArray(source.rules)
    ? source.rules
    : DEFAULT_WILDCARD_SETTINGS.rules;
  const usedIds = new Set();
  const rules = rawRules.map((rule, index) => {
    const categorySource = Array.isArray(rule?.categoryNames)
      ? rule.categoryNames
      : String(rule?.categoryName || "").split(",");
    const categoryNames = [...new Set(categorySource
      .map((categoryName) => String(categoryName || "").trim())
      .filter(Boolean))];
    if (!categoryNames.length) {
      throw new Error(`와일드카드 분류 규칙 ${index + 1}에 카테고리 조건이 필요합니다.`);
    }
    const idBase = String(rule?.id || `rule-${index + 1}`).trim()
      || `rule-${index + 1}`;
    let id = idBase;
    let idSuffix = 2;
    while (usedIds.has(id)) {
      id = `${idBase}-${idSuffix}`;
      idSuffix += 1;
    }
    usedIds.add(id);
    return {
      id,
      name: String(rule?.name || "").trim() || `분류 ${index + 1}`,
      categoryNames,
      outputPath: normalizeWildcardRelativePath(
        rule?.outputPath,
        `와일드카드 분류 규칙 ${index + 1} 저장 경로`,
      ),
      enabled: rule?.enabled !== false,
    };
  });

  const paths = [appearancePath, defaultScenarioPath, ...rules.map((rule) => rule.outputPath)];
  const normalizedPaths = paths.map((relativePath) => relativePath.toLowerCase());
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new Error("와일드카드 출력 저장 경로는 서로 중복될 수 없습니다.");
  }
  return { appearancePath, defaultScenarioPath, rules };
}

function resolveWildcardOutputPath(wildcardDir, relativePath) {
  const safeRelativePath = normalizeWildcardRelativePath(relativePath, "와일드카드 저장 경로");
  const root = path.resolve(wildcardDir);
  const target = path.resolve(root, ...safeRelativePath.split("/"));
  const rootPrefix = `${root}${path.sep}`;
  if (!target.startsWith(rootPrefix)) {
    throw new Error("와일드카드 저장 경로가 와일드카드 폴더를 벗어날 수 없습니다.");
  }
  return target;
}

/**
 * Converts a wildcard value into one trimmed physical line.
 *
 * @param {*} value Value to normalize.
 * @returns {string} Normalized wildcard line.
 */
function normalizeWildcardLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function sectionText(item, sectionKey) {
  const sentences = item?.promptJson?.[sectionKey]?.sentences;
  if (!Array.isArray(sentences)) return "";
  return normalizeWildcardLine(sentences.map((sentence) => sentence?.en || "").filter(Boolean).join(" "));
}

/**
 * Builds the appearance and face-excluded scenario lines for an archive item.
 *
 * @param {object} item Prompt archive item.
 * @returns {{id: string, appearance: string, scenario: string}|null} Complete
 *     wildcard record, or `null` when a required field is missing.
 */
function buildWildcardRecord(item) {
  const id = String(item?.id || "").trim();
  const appearance = sectionText(item, "appearance");
  const scenarioParts = SCENARIO_SECTIONS.map((sectionKey) => sectionText(item, sectionKey));
  if (!id || !appearance || scenarioParts.some((part) => !part)) return null;
  return { id, appearance, scenario: normalizeWildcardLine(scenarioParts.join(" ")) };
}

function categoryNamesById(settings) {
  const categories = Array.isArray(settings?.categories) ? settings.categories : [];
  return new Map(categories
    .map((category) => [String(category?.id || "").trim(), String(category?.name || "").trim()])
    .filter(([id, name]) => id && name));
}

function itemCategoryName(item, categoryNames) {
  const directName = typeof item?.categoryName === "string"
    ? item.categoryName
    : typeof item?.category === "string" ? item.category : "";
  return directName || categoryNames.get(String(item?.categoryId || "").trim()) || "";
}

function scenarioPathForItem(item, categoryNames, wildcardSettings) {
  const categoryName = normalizedCategoryName(itemCategoryName(item, categoryNames));
  const matchingRule = wildcardSettings.rules.find((rule) => (
    rule.enabled
    && rule.categoryNames.some((condition) => normalizedCategoryName(condition) === categoryName)
  ));
  return matchingRule?.outputPath || wildcardSettings.defaultScenarioPath;
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

async function readOptionalTextFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function replaceWildcardFiles(changes) {
  const active = changes.filter((change) => change.force || change.original !== change.updated);
  if (!active.length) return;
  const stamp = `${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}`;
  const staged = [];
  try {
    for (const change of active) {
      await fs.mkdir(path.dirname(change.filePath), { recursive: true });
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

function currentScenarioTargets(items, categoryNames, wildcardSettings) {
  const targets = new Map();
  const activePaths = [
    wildcardSettings.defaultScenarioPath,
    ...wildcardSettings.rules.filter((rule) => rule.enabled).map((rule) => rule.outputPath),
  ];
  for (const relativePath of activePaths) targets.set(relativePath, new Set());
  for (const item of items) {
    const record = buildWildcardRecord(item);
    if (!record) continue;
    const relativePath = scenarioPathForItem(item, categoryNames, wildcardSettings);
    targets.get(relativePath).add(lineHash(record.scenario));
  }
  return targets;
}

function normalizeStoredPathList(paths, fallbackPaths) {
  const source = Array.isArray(paths) && paths.length ? paths : fallbackPaths;
  return [...new Set(source.map((relativePath) => (
    normalizeWildcardRelativePath(relativePath, "이전 와일드카드 저장 경로")
  )))];
}

function normalizeSyncState(source) {
  const state = JSON.parse(source);
  if (
    !state
    || ![1, STATE_VERSION].includes(state.version)
    || !state.processedItems
    || typeof state.processedItems !== "object"
    || Array.isArray(state.processedItems)
  ) {
    throw new Error("와일드카드 업데이트 기록 파일 형식이 올바르지 않습니다.");
  }
  return {
    ...state,
    version: STATE_VERSION,
    appearancePaths: normalizeStoredPathList(
      state.appearancePaths || (state.appearancePath ? [state.appearancePath] : []),
      [DEFAULT_WILDCARD_SETTINGS.appearancePath],
    ),
    scenarioPaths: normalizeStoredPathList(
      state.scenarioPaths,
      [
        DEFAULT_WILDCARD_SETTINGS.defaultScenarioPath,
        ...DEFAULT_WILDCARD_SETTINGS.rules.map((rule) => rule.outputPath),
      ],
    ),
  };
}

async function readManagedSources(wildcardDir, relativePaths) {
  const sources = new Map();
  await Promise.all(relativePaths.map(async (relativePath) => {
    const filePath = resolveWildcardOutputPath(wildcardDir, relativePath);
    const [source, exists] = await Promise.all([
      readOptionalTextFile(filePath),
      pathExists(filePath),
    ]);
    sources.set(relativePath, { filePath, source, exists });
  }));
  return sources;
}

function reconcileManagedLines(sources, targetHashesByPath) {
  const desiredPathsByHash = new Map();
  for (const [relativePath, hashes] of targetHashesByPath) {
    for (const hash of hashes) {
      if (!desiredPathsByHash.has(hash)) desiredPathsByHash.set(hash, new Set());
      desiredPathsByHash.get(hash).add(relativePath);
    }
  }

  const canonicalLines = new Map();
  const nextLinesByPath = new Map();
  const hashesByPath = new Map();
  const statsByPath = new Map();
  for (const [relativePath, entry] of sources) {
    const nextLines = [];
    const hashes = new Set();
    let movedOut = 0;
    for (const line of linesFromText(entry.source)) {
      const hash = lineHash(line);
      if (!canonicalLines.has(hash)) canonicalLines.set(hash, line);
      const desiredPaths = desiredPathsByHash.get(hash);
      if (desiredPaths?.size && !desiredPaths.has(relativePath)) {
        movedOut += 1;
        continue;
      }
      if (hashes.has(hash)) continue;
      hashes.add(hash);
      nextLines.push(line);
    }
    nextLinesByPath.set(relativePath, nextLines);
    hashesByPath.set(relativePath, hashes);
    statsByPath.set(relativePath, { movedIn: 0, movedOut });
  }

  for (const [hash, desiredPaths] of desiredPathsByHash) {
    const line = canonicalLines.get(hash);
    if (!line) continue;
    for (const relativePath of desiredPaths) {
      const hashes = hashesByPath.get(relativePath);
      const lines = nextLinesByPath.get(relativePath);
      if (!hashes || !lines || hashes.has(hash)) continue;
      hashes.add(hash);
      lines.push(line);
      statsByPath.get(relativePath).movedIn += 1;
    }
  }

  const updatedSources = new Map();
  for (const [relativePath, entry] of sources) {
    const updated = wildcardLinesText(nextLinesByPath.get(relativePath));
    updatedSources.set(relativePath, { ...entry, updated });
  }
  return {
    sources: updatedSources,
    hashesByPath,
    statsByPath,
    moved: [...statsByPath.values()].reduce((total, stats) => total + stats.movedIn, 0),
  };
}

function wildcardFileChanges(reconciledSources, forcePaths = new Set()) {
  return [...reconciledSources.entries()].map(([relativePath, entry]) => ({
    filePath: entry.filePath,
    original: entry.source,
    updated: entry.updated,
    force: forcePaths.has(relativePath) && !entry.exists,
  }));
}

function currentManagedPaths(wildcardSettings) {
  return {
    appearancePaths: [wildcardSettings.appearancePath],
    scenarioPaths: [
      wildcardSettings.defaultScenarioPath,
      ...wildcardSettings.rules.filter((rule) => rule.enabled).map((rule) => rule.outputPath),
    ],
  };
}

function uniqueWildcardPaths(paths) {
  const byNormalizedPath = new Map();
  for (const relativePath of paths) {
    const safePath = normalizeWildcardRelativePath(relativePath, "와일드카드 저장 경로");
    const key = safePath.toLowerCase();
    if (!byNormalizedPath.has(key)) byNormalizedPath.set(key, safePath);
  }
  return [...byNormalizedPath.values()];
}

function wildcardStateSource(state, updatedAt, managedPaths) {
  return JSON.stringify({
    ...state,
    version: STATE_VERSION,
    updatedAt,
    appearancePaths: managedPaths.appearancePaths,
    scenarioPaths: managedPaths.scenarioPaths,
  }, null, 2);
}

/**
 * Requests an Impact Pack wildcard-list refresh without failing file updates.
 *
 * @param {string} refreshUrl ComfyUI Impact Pack refresh endpoint.
 * @returns {Promise<{refreshed: boolean, message: string}>} Refresh outcome.
 */
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

/**
 * Adds unprocessed archive items and reconciles known scenarios by category.
 *
 * @param {object} options Synchronization paths and optional test dependencies.
 * @param {string} options.itemsPath Path to the prompt archive JSON array.
 * @param {string} [options.settingsPath] Path to settings containing categories.
 * @param {string} options.statePath Path to the incremental processing state.
 * @param {string} options.wildcardDir Directory containing wildcard text files.
 * @param {string} [options.refreshUrl] ComfyUI Impact Pack refresh endpoint.
 * @param {Function} [options.refreshWildcards] Refresh dependency override.
 * @param {Function} [options.now] ISO timestamp provider.
 * @returns {Promise<object>} Counts for additions, migrations, and refresh status.
 */
async function syncWildcards(options) {
  const {
    itemsPath,
    settingsPath,
    statePath,
    wildcardDir,
    refreshUrl = "http://127.0.0.1:8188/impact/wildcards/refresh",
    refreshWildcards = () => defaultRefreshWildcards(refreshUrl),
    now = () => new Date().toISOString(),
  } = options;
  const [itemsSource, settingsSource, stateSource, stateExists] = await Promise.all([
    fs.readFile(itemsPath, "utf8"),
    settingsPath ? fs.readFile(settingsPath, "utf8") : Promise.resolve("{}"),
    readOptionalTextFile(statePath),
    pathExists(statePath),
  ]);
  const items = JSON.parse(itemsSource);
  if (!Array.isArray(items)) throw new Error("items.json의 최상위 값이 배열이 아닙니다.");
  const savedSettings = JSON.parse(settingsSource);
  const wildcardSettings = normalizeWildcardSettings(savedSettings.wildcardSettings);
  const categoryNames = categoryNamesById(savedSettings);
  const managedPaths = currentManagedPaths(wildcardSettings);
  const previousState = stateExists ? normalizeSyncState(stateSource) : null;
  const previousAppearancePaths = previousState?.appearancePaths
    || [DEFAULT_WILDCARD_SETTINGS.appearancePath];
  const previousScenarioPaths = previousState?.scenarioPaths
    || [
      DEFAULT_WILDCARD_SETTINGS.defaultScenarioPath,
      ...DEFAULT_WILDCARD_SETTINGS.rules.map((rule) => rule.outputPath),
    ];
  const appearanceSourcePaths = uniqueWildcardPaths([
    ...previousAppearancePaths,
    wildcardSettings.appearancePath,
  ]);
  const scenarioSourcePaths = uniqueWildcardPaths([
    ...previousScenarioPaths,
    wildcardSettings.defaultScenarioPath,
    ...wildcardSettings.rules.map((rule) => rule.outputPath),
  ]);
  const [appearanceSources, scenarioSources] = await Promise.all([
    readManagedSources(wildcardDir, appearanceSourcePaths),
    readManagedSources(wildcardDir, scenarioSourcePaths),
  ]);
  const records = items.map((item) => ({ item, record: buildWildcardRecord(item) }));
  const appearanceTargets = new Map([[
    wildcardSettings.appearancePath,
    new Set(records.filter(({ record }) => record).map(({ record }) => lineHash(record.appearance))),
  ]]);
  const scenarioTargets = currentScenarioTargets(
    items,
    categoryNames,
    wildcardSettings,
  );
  const appearanceReconciliation = reconcileManagedLines(appearanceSources, appearanceTargets);
  const scenarioReconciliation = reconcileManagedLines(scenarioSources, scenarioTargets);
  const updatedAt = now();
  const forceAppearancePaths = new Set(managedPaths.appearancePaths);
  const forceScenarioPaths = new Set(managedPaths.scenarioPaths);

  if (!stateExists) {
    const processedItems = Object.create(null);
    let invalidItems = 0;
    for (const { record } of records) {
      if (!record) {
        invalidItems += 1;
        continue;
      }
      processedItems[record.id] = processedEntry(record, updatedAt);
    }
    const state = {
      initializedAt: updatedAt,
      processedItems,
    };
    await replaceWildcardFiles([
      ...wildcardFileChanges(appearanceReconciliation.sources, forceAppearancePaths),
      ...wildcardFileChanges(scenarioReconciliation.sources, forceScenarioPaths),
      {
        filePath: statePath,
        original: "",
        updated: wildcardStateSource(state, updatedAt, managedPaths),
        force: true,
      },
    ]);
    const refresh = await refreshWildcards();
    const scenarioOutputs = [...scenarioReconciliation.statsByPath.entries()]
      .filter(([relativePath, stats]) => (
        forceScenarioPaths.has(relativePath) || stats.movedIn || stats.movedOut
      ))
      .map(([relativePath, stats]) => ({
        path: relativePath,
        added: 0,
        ...stats,
      }));
    return {
      initialized: true,
      totalItems: items.length,
      previouslyProcessed: 0,
      newItems: 0,
      appearanceAdded: 0,
      scenarioAdded: 0,
      nsfwScenarioAdded: 0,
      scenariosAdded: 0,
      appearanceMoved: appearanceReconciliation.moved,
      scenariosMoved: scenarioReconciliation.moved,
      scenarioMovedToNsfw: scenarioReconciliation.statsByPath.get("nsfw.txt")?.movedIn || 0,
      scenarioMovedToGeneral: scenarioReconciliation.statsByPath.get(
        wildcardSettings.defaultScenarioPath,
      )?.movedIn || 0,
      scenarioOutputs,
      duplicatesSkipped: 0,
      invalidItems,
      refreshed: Boolean(refresh?.refreshed),
      refreshMessage: refresh?.message || "",
      updatedAt,
    };
  }

  const state = previousState;
  const previouslyProcessed = Object.keys(state.processedItems).length;
  const appearanceHashes = appearanceReconciliation.hashesByPath.get(
    wildcardSettings.appearancePath,
  );
  const appearanceAdditions = [];
  const scenarioAdditionsByPath = new Map(
    managedPaths.scenarioPaths.map((relativePath) => [relativePath, []]),
  );
  let newItems = 0;
  let duplicatesSkipped = 0;
  let invalidItems = 0;

  for (const { item, record } of records) {
    const id = String(item?.id || "").trim();
    if (id && Object.prototype.hasOwnProperty.call(state.processedItems, id)) continue;
    newItems += 1;
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
    const scenarioRelativePath = scenarioPathForItem(item, categoryNames, wildcardSettings);
    const targetHashes = scenarioReconciliation.hashesByPath.get(scenarioRelativePath);
    const targetAdditions = scenarioAdditionsByPath.get(scenarioRelativePath);
    if (targetHashes.has(scenarioHash)) {
      duplicatesSkipped += 1;
    } else {
      targetHashes.add(scenarioHash);
      targetAdditions.push(record.scenario);
    }
    state.processedItems[record.id] = processedEntry(record, updatedAt);
  }

  const appearanceEntry = appearanceReconciliation.sources.get(wildcardSettings.appearancePath);
  appearanceEntry.updated = appendLines(appearanceEntry.updated, appearanceAdditions);
  for (const [relativePath, additions] of scenarioAdditionsByPath) {
    const entry = scenarioReconciliation.sources.get(relativePath);
    entry.updated = appendLines(entry.updated, additions);
  }
  const nextStateSource = wildcardStateSource(state, updatedAt, managedPaths);
  await replaceWildcardFiles([
    ...wildcardFileChanges(appearanceReconciliation.sources, forceAppearancePaths),
    ...wildcardFileChanges(scenarioReconciliation.sources, forceScenarioPaths),
    {
      filePath: statePath,
      original: stateSource,
      updated: nextStateSource,
    },
  ]);
  const refresh = await refreshWildcards();
  const scenariosAdded = [...scenarioAdditionsByPath.values()]
    .reduce((total, additions) => total + additions.length, 0);
  const scenarioOutputs = [...scenarioReconciliation.statsByPath.entries()]
    .filter(([relativePath, stats]) => (
      forceScenarioPaths.has(relativePath)
      || stats.movedIn
      || stats.movedOut
      || scenarioAdditionsByPath.get(relativePath)?.length
    ))
    .map(([relativePath, stats]) => ({
      path: relativePath,
      added: scenarioAdditionsByPath.get(relativePath)?.length || 0,
      ...stats,
    }));
  return {
    initialized: false,
    totalItems: items.length,
    previouslyProcessed,
    newItems,
    appearanceAdded: appearanceAdditions.length,
    scenarioAdded: scenarioAdditionsByPath.get(wildcardSettings.defaultScenarioPath)?.length || 0,
    nsfwScenarioAdded: scenarioAdditionsByPath.get("nsfw.txt")?.length || 0,
    scenariosAdded,
    appearanceMoved: appearanceReconciliation.moved,
    scenariosMoved: scenarioReconciliation.moved,
    scenarioMovedToNsfw: scenarioReconciliation.statsByPath.get("nsfw.txt")?.movedIn || 0,
    scenarioMovedToGeneral: scenarioReconciliation.statsByPath.get(
      wildcardSettings.defaultScenarioPath,
    )?.movedIn || 0,
    scenarioOutputs,
    duplicatesSkipped,
    invalidItems,
    refreshed: Boolean(refresh?.refreshed),
    refreshMessage: refresh?.message || "",
    updatedAt,
  };
}

/**
 * Recreates all wildcard files from the current prompt archive.
 *
 * @param {object} options Rebuild paths and optional test dependencies.
 * @param {string} options.itemsPath Path to the prompt archive JSON array.
 * @param {string} [options.settingsPath] Path to settings containing categories.
 * @param {string} options.statePath Path to the incremental processing state.
 * @param {string} options.wildcardDir Directory containing wildcard text files.
 * @param {string} [options.refreshUrl] ComfyUI Impact Pack refresh endpoint.
 * @param {Function} [options.refreshWildcards] Refresh dependency override.
 * @param {Function} [options.now] ISO timestamp provider.
 * @returns {Promise<object>} Counts for written records and refresh status.
 */
async function rebuildWildcards(options) {
  const {
    itemsPath,
    settingsPath,
    statePath,
    wildcardDir,
    refreshUrl = "http://127.0.0.1:8188/impact/wildcards/refresh",
    refreshWildcards = () => defaultRefreshWildcards(refreshUrl),
    now = () => new Date().toISOString(),
  } = options;
  const [itemsSource, settingsSource, previousStateSource, stateExists] = await Promise.all([
    fs.readFile(itemsPath, "utf8"),
    settingsPath ? fs.readFile(settingsPath, "utf8") : Promise.resolve("{}"),
    readOptionalTextFile(statePath),
    pathExists(statePath),
  ]);
  const items = JSON.parse(itemsSource);
  if (!Array.isArray(items)) throw new Error("items.json의 최상위 값이 배열이 아닙니다.");
  const savedSettings = JSON.parse(settingsSource);
  const wildcardSettings = normalizeWildcardSettings(savedSettings.wildcardSettings);
  const categoryNames = categoryNamesById(savedSettings);
  const managedPaths = currentManagedPaths(wildcardSettings);
  const previousState = stateExists ? normalizeSyncState(previousStateSource) : null;
  const appearanceSourcePaths = uniqueWildcardPaths([
    ...(previousState?.appearancePaths || [DEFAULT_WILDCARD_SETTINGS.appearancePath]),
    wildcardSettings.appearancePath,
  ]);
  const scenarioSourcePaths = uniqueWildcardPaths([
    ...(previousState?.scenarioPaths || [
      DEFAULT_WILDCARD_SETTINGS.defaultScenarioPath,
      ...DEFAULT_WILDCARD_SETTINGS.rules.map((rule) => rule.outputPath),
    ]),
    wildcardSettings.defaultScenarioPath,
    ...wildcardSettings.rules.map((rule) => rule.outputPath),
  ]);
  const [appearanceSources, scenarioSources] = await Promise.all([
    readManagedSources(wildcardDir, appearanceSourcePaths),
    readManagedSources(wildcardDir, scenarioSourcePaths),
  ]);

  const updatedAt = now();
  const processedItems = Object.create(null);
  const appearanceHashes = new Set();
  const appearanceLines = [];
  const scenarioLinesByPath = new Map(
    managedPaths.scenarioPaths.map((relativePath) => [relativePath, []]),
  );
  const scenarioHashesByPath = new Map(
    managedPaths.scenarioPaths.map((relativePath) => [relativePath, new Set()]),
  );
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
    const scenarioRelativePath = scenarioPathForItem(item, categoryNames, wildcardSettings);
    const targetHashes = scenarioHashesByPath.get(scenarioRelativePath);
    const targetLines = scenarioLinesByPath.get(scenarioRelativePath);
    if (targetHashes.has(scenarioHash)) duplicatesSkipped += 1;
    else {
      targetHashes.add(scenarioHash);
      targetLines.push(record.scenario);
    }
  }

  const nextAppearanceSource = wildcardLinesText(appearanceLines);
  for (const [relativePath, entry] of appearanceSources) {
    entry.updated = relativePath === wildcardSettings.appearancePath
      ? nextAppearanceSource
      : "";
  }
  for (const [relativePath, entry] of scenarioSources) {
    entry.updated = wildcardLinesText(scenarioLinesByPath.get(relativePath) || []);
  }
  const nextStateSource = wildcardStateSource({
    initializedAt: updatedAt,
    processedItems,
  }, updatedAt, managedPaths);
  const forceAppearancePaths = new Set(managedPaths.appearancePaths);
  const forceScenarioPaths = new Set(managedPaths.scenarioPaths);
  await replaceWildcardFiles([
    ...wildcardFileChanges(appearanceSources, forceAppearancePaths),
    ...wildcardFileChanges(scenarioSources, forceScenarioPaths),
    {
      filePath: statePath,
      original: previousStateSource,
      updated: nextStateSource,
      force: !stateExists,
    },
  ]);
  const refresh = await refreshWildcards();
  const scenarioOutputs = managedPaths.scenarioPaths.map((relativePath) => ({
    path: relativePath,
    written: scenarioLinesByPath.get(relativePath).length,
    previousLines: linesFromText(scenarioSources.get(relativePath)?.source).length,
  }));
  const defaultScenarioLines = scenarioLinesByPath.get(wildcardSettings.defaultScenarioPath) || [];
  const nsfwScenarioLines = scenarioLinesByPath.get("nsfw.txt") || [];
  return {
    rebuilt: true,
    totalItems: items.length,
    validItems,
    invalidItems,
    appearanceWritten: appearanceLines.length,
    scenarioWritten: defaultScenarioLines.length,
    nsfwScenarioWritten: nsfwScenarioLines.length,
    scenariosWritten: scenarioOutputs.reduce((total, output) => total + output.written, 0),
    scenarioOutputs,
    previousAppearanceLines: linesFromText(
      appearanceSources.get(wildcardSettings.appearancePath)?.source,
    ).length,
    previousScenarioLines: linesFromText(
      scenarioSources.get(wildcardSettings.defaultScenarioPath)?.source,
    ).length,
    previousNsfwScenarioLines: linesFromText(scenarioSources.get("nsfw.txt")?.source).length,
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
  normalizeWildcardSettings,
  rebuildWildcards,
  resolveWildcardOutputPath,
  syncWildcards,
};
