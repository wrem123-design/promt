(function (root, factory) {
  const api = factory(root?.indexedDB);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptArchiveLoraSorterStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (indexedDb) {
  "use strict";

  const DATABASE_NAME = "prompt-archive-tools";
  const STORE_NAME = "settings";
  const RECORD_KEY = "lora-sorter.v1";

  function validKey(value) {
    return typeof value === "string" && Boolean(value.trim());
  }

  function normalizedStringSet(values) {
    if (!Array.isArray(values) && !(values instanceof Set)) return new Set();
    const entries = new Map();
    for (const value of values) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      const key = trimmed.toLowerCase();
      if (key && !entries.has(key)) entries.set(key, trimmed);
    }
    return new Set(entries.values());
  }

  function snapshotSettings(settings = {}) {
    return {
      version: 1,
      sourceHandle: settings.sourceHandle || null,
      baseDestinationHandle: settings.baseDestinationHandle || null,
      destinations: settings.destinationHandles instanceof Map
        ? [...settings.destinationHandles].filter(([key, handle]) => validKey(key) && handle)
        : [],
      excludedGroupKeys: settings.excludedGroupKeys instanceof Set
        ? [...settings.excludedGroupKeys].filter(validKey)
        : [],
      detectionExcludedLoras: [...normalizedStringSet(settings.detectionExcludedLoras)],
      includeSubfolders: settings.includeSubfolders === true,
      collisionMode: settings.collisionMode === "skip" ? "skip" : "rename",
    };
  }

  function hydrateSettings(record = {}) {
    const destinations = Array.isArray(record.destinations)
      ? record.destinations.filter((entry) => Array.isArray(entry) && validKey(entry[0]) && entry[1])
      : [];
    const excludedGroupKeys = Array.isArray(record.excludedGroupKeys)
      ? record.excludedGroupKeys.filter(validKey)
      : [];
    const detectionExcludedLoras = normalizedStringSet(record.detectionExcludedLoras);
    return {
      sourceHandle: record.sourceHandle || null,
      baseDestinationHandle: record.baseDestinationHandle || null,
      destinationHandles: new Map(destinations),
      excludedGroupKeys: new Set(excludedGroupKeys),
      detectionExcludedLoras,
      includeSubfolders: record.includeSubfolders === true,
      collisionMode: record.collisionMode === "skip" ? "skip" : "rename",
    };
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB 요청에 실패했습니다."));
    });
  }

  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 저장에 실패했습니다."));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB 저장이 취소되었습니다."));
    });
  }

  function openDatabase() {
    if (!indexedDb) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("설정 저장소를 열지 못했습니다."));
    });
  }

  async function load() {
    const database = await openDatabase();
    if (!database) return null;
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const record = await requestResult(transaction.objectStore(STORE_NAME).get(RECORD_KEY));
      return record ? hydrateSettings(record) : null;
    } finally {
      database.close();
    }
  }

  async function save(settings) {
    const database = await openDatabase();
    if (!database) return false;
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const completed = transactionComplete(transaction);
      transaction.objectStore(STORE_NAME).put(snapshotSettings(settings), RECORD_KEY);
      await completed;
      return true;
    } finally {
      database.close();
    }
  }

  return { hydrateSettings, load, save, snapshotSettings };
});
