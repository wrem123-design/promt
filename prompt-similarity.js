(function initPromptSimilarity(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptArchiveSimilarity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPromptSimilarityApi() {
  "use strict";

  function normalizePromptText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function countValues(values) {
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return counts;
  }

  function diceCoefficient(leftCounts, leftLength, rightCounts, rightLength) {
    if (!leftLength || !rightLength) return 0;
    const [smallerCounts, largerCounts] = leftCounts.size <= rightCounts.size
      ? [leftCounts, rightCounts]
      : [rightCounts, leftCounts];
    let overlap = 0;
    smallerCounts.forEach((count, value) => {
      overlap += Math.min(count, largerCounts.get(value) || 0);
    });
    return (2 * overlap) / (leftLength + rightLength);
  }

  function adjacentPairs(values) {
    const pairs = [];
    for (let index = 0; index < values.length - 1; index += 1) {
      pairs.push(`${values[index]}\u0000${values[index + 1]}`);
    }
    return pairs;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function characterNgrams(value, size = 3, maxGrams = 256) {
    const compact = value.replace(/\s+/g, "");
    if (!compact) return [];
    if (compact.length <= size) return [compact];
    const total = compact.length - size + 1;
    const uniqueGrams = new Set();
    for (let index = 0; index < total; index += 1) uniqueGrams.add(compact.slice(index, index + size));
    if (uniqueGrams.size <= maxGrams) return [...uniqueGrams];
    return [...uniqueGrams]
      .map((gram) => ({ gram, hash: stableHash(gram) }))
      .sort((left, right) => left.hash - right.hash || left.gram.localeCompare(right.gram))
      .slice(0, maxGrams)
      .map((entry) => entry.gram);
  }

  function createSimilarityProfile(value) {
    const normalized = normalizePromptText(value);
    const tokens = normalized ? normalized.split(" ") : [];
    const tokenPairs = adjacentPairs(tokens);
    const characterGrams = characterNgrams(normalized);
    return {
      normalized,
      tokenCount: tokens.length,
      tokenCounts: countValues(tokens),
      tokenPairCount: tokenPairs.length,
      tokenPairCounts: countValues(tokenPairs),
      characterGramCount: characterGrams.length,
      characterGramCounts: countValues(characterGrams),
    };
  }

  function scoreProfiles(left, right) {
    if (!left.normalized || !right.normalized) return 0;
    if (left.normalized === right.normalized) return 100;

    const tokenScore = diceCoefficient(left.tokenCounts, left.tokenCount, right.tokenCounts, right.tokenCount);
    const pairScore = diceCoefficient(left.tokenPairCounts, left.tokenPairCount, right.tokenPairCounts, right.tokenPairCount);
    const characterScore = diceCoefficient(left.characterGramCounts, left.characterGramCount, right.characterGramCounts, right.characterGramCount);
    const availableWeights = [
      [tokenScore, left.tokenCount && right.tokenCount ? 0.3 : 0],
      [pairScore, left.tokenPairCount && right.tokenPairCount ? 0.15 : 0],
      [characterScore, left.characterGramCount && right.characterGramCount ? 0.55 : 0],
    ];
    const weightTotal = availableWeights.reduce((sum, entry) => sum + entry[1], 0);
    if (!weightTotal) return 0;
    const weightedScore = availableWeights.reduce((sum, entry) => sum + entry[0] * entry[1], 0) / weightTotal;
    return Math.max(0, Math.min(99, Math.round(weightedScore * 100)));
  }

  function calculatePromptSimilarity(leftText, rightText) {
    return scoreProfiles(createSimilarityProfile(leftText), createSimilarityProfile(rightText));
  }

  function sectionText(value) {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
      return value.map(sectionText).filter(Boolean).join(" ").trim();
    }
    if (!value || typeof value !== "object") return "";
    if (Array.isArray(value.sentences)) return sectionText(value.sentences);
    return String(value.en || value.text || value.ko || "").trim();
  }

  function corePromptSections(value) {
    if (typeof value === "string") {
      const paragraphs = value
        .split(/\n\s*\n+/)
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return paragraphs.length >= 3
        ? { outfit: paragraphs[1], background: paragraphs[2] }
        : { outfit: "", background: "" };
    }
    if (!value || typeof value !== "object") return { outfit: "", background: "" };
    const source = value.promptJson || value.promptSections || value;
    return {
      outfit: sectionText(source?.outfit),
      background: sectionText(source?.background),
    };
  }

  function createCorePromptProfile(value) {
    const sections = corePromptSections(value);
    const outfit = createSimilarityProfile(sections.outfit);
    const background = createSimilarityProfile(sections.background);
    const comparable = Boolean(outfit.normalized && background.normalized);
    return {
      outfit,
      background,
      comparable,
      signature: comparable ? JSON.stringify([outfit.normalized, background.normalized]) : "",
    };
  }

  function scoreCorePromptProfiles(left, right) {
    if (!left.comparable || !right.comparable) return 0;
    if (left.signature === right.signature) return 100;
    const outfitScore = scoreProfiles(left.outfit, right.outfit);
    const backgroundScore = scoreProfiles(left.background, right.background);
    return Math.min(99, Math.round((outfitScore + backgroundScore) / 2));
  }

  function calculateCorePromptSimilarity(left, right) {
    return scoreCorePromptProfiles(createCorePromptProfile(left), createCorePromptProfile(right));
  }

  function corePromptSignature(value) {
    const sections = corePromptSections(value);
    const outfit = normalizePromptText(sections.outfit);
    const background = normalizePromptText(sections.background);
    return outfit && background ? JSON.stringify([outfit, background]) : "";
  }

  function isCorePromptDuplicate(left, right) {
    const leftSignature = corePromptSignature(left);
    return Boolean(leftSignature && leftSignature === corePromptSignature(right));
  }

  function findCorePromptDuplicate(items, candidate, options = {}) {
    const excludeId = String(options.excludeId || "");
    const getId = typeof options.getId === "function" ? options.getId : (item) => item?.id;
    const getPrompt = typeof options.getPrompt === "function" ? options.getPrompt : (item) => item;
    return items.find((item, index) => {
      if (excludeId && String(getId(item, index) || "") === excludeId) return false;
      return isCorePromptDuplicate(candidate, getPrompt(item, index));
    }) || null;
  }

  function buildDuplicateIndex(items, getKey = corePromptSignature, getId = (_item, index) => String(index)) {
    const groups = new Map();
    items.forEach((item, index) => {
      const key = String(getKey(item, index) || "");
      if (!key) return;
      const id = String(getId(item, index));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(id);
    });
    const duplicateIds = new Set();
    groups.forEach((ids) => {
      if (ids.length > 1) ids.forEach((id) => duplicateIds.add(id));
    });
    return { groups, duplicateIds };
  }

  function rankByPromptSimilarity(items, getPrompt = (item) => item, getId = (_item, index) => String(index)) {
    const entries = items.map((item, index) => ({
      item,
      index,
      id: String(getId(item, index)),
      profile: createCorePromptProfile(getPrompt(item, index)),
      score: 0,
      matchId: null,
    }));

    const exactGroups = new Map();
    entries.forEach((entry) => {
      if (!entry.profile.signature) return;
      if (!exactGroups.has(entry.profile.signature)) exactGroups.set(entry.profile.signature, []);
      exactGroups.get(entry.profile.signature).push(entry);
    });

    const placed = new Set();
    const rankedGroups = [];
    exactGroups.forEach((members) => {
      if (members.length < 2) return;
      members.forEach((entry, index) => {
        entry.score = 100;
        entry.matchId = members[index === 0 ? 1 : 0].id;
        placed.add(entry.id);
      });
      rankedGroups.push({ score: 100, index: members[0].index, members });
    });

    const pairCandidates = [];
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      const left = entries[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const right = entries[rightIndex];
        const score = scoreCorePromptProfiles(left.profile, right.profile);
        if (score > 0) pairCandidates.push({ left, right, score });
      }
    }

    pairCandidates
      .sort((left, right) => right.score - left.score
        || left.left.index - right.left.index
        || left.right.index - right.right.index)
      .forEach((pair) => {
        if (placed.has(pair.left.id) || placed.has(pair.right.id)) return;
        pair.left.score = pair.score;
        pair.left.matchId = pair.right.id;
        pair.right.score = pair.score;
        pair.right.matchId = pair.left.id;
        placed.add(pair.left.id);
        placed.add(pair.right.id);
        rankedGroups.push({
          score: pair.score,
          index: Math.min(pair.left.index, pair.right.index),
          members: [pair.left, pair.right].sort((left, right) => left.index - right.index),
        });
      });

    entries.forEach((entry) => {
      if (placed.has(entry.id)) return;
      const closest = pairCandidates
        .filter((pair) => pair.left.id === entry.id || pair.right.id === entry.id)
        .sort((left, right) => right.score - left.score)[0];
      if (closest) {
        entry.score = closest.score;
        entry.matchId = closest.left.id === entry.id ? closest.right.id : closest.left.id;
      }
      rankedGroups.push({ score: entry.score, index: entry.index, members: [entry] });
    });

    return rankedGroups
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .flatMap((group) => group.members)
      .map(({ profile: _profile, index: _index, id: _id, ...entry }) => entry);
  }

  return {
    buildDuplicateIndex,
    calculateCorePromptSimilarity,
    calculatePromptSimilarity,
    corePromptSections,
    corePromptSignature,
    createCorePromptProfile,
    createSimilarityProfile,
    findCorePromptDuplicate,
    isCorePromptDuplicate,
    normalizePromptText,
    rankByPromptSimilarity,
  };
});
