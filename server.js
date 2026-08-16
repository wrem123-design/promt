const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
  normalizeWildcardSettings,
  rebuildWildcards,
  syncWildcards,
} = require("./wildcard-sync.js");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(rootDir, "uploads");
const backupDir = path.join(rootDir, "backup");
const statePath = path.join(dataDir, "state.json");
const settingsPath = path.join(dataDir, "settings.json");
const providersPath = path.join(dataDir, "providers.json");
const providerSecretsPath = path.join(dataDir, "provider-secrets.json");
const tagsPath = path.join(dataDir, "tags.json");
const itemsPath = path.join(dataDir, "items.json");
const videoItemsPath = path.join(dataDir, "video-items.json");
const wildcardSyncStatePath = path.join(dataDir, "wildcard-sync-state.json");
const wildcardDir = process.env.COMFYUI_WILDCARD_DIR
  || "D:\\ComfyUI-Easy-Install\\ComfyUI\\custom_nodes\\comfyui-impact-pack\\wildcards\\items";
const impactWildcardRefreshUrl = process.env.COMFYUI_WILDCARD_REFRESH_URL
  || "http://127.0.0.1:8188/impact/wildcards/refresh";
let wildcardSyncInProgress = false;
const port = Number(process.env.PORT || 5173);
const allowRemote = process.env.ALLOW_REMOTE === "1";
const requestedHost = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
const host = allowRemote || isLoopbackHost(requestedHost) ? requestedHost : "127.0.0.1";
const maxRequestBytes = Number(process.env.MAX_REQUEST_MB || 150) * 1024 * 1024;
const publicFiles = new Map([
  ["/index.html", path.join(rootDir, "index.html")],
  ["/image-converter.js", path.join(rootDir, "image-converter.js")],
  ["/lora-sorter.js", path.join(rootDir, "lora-sorter.js")],
  ["/lora-sorter-storage.js", path.join(rootDir, "lora-sorter-storage.js")],
  ["/exif-prompt-resolver.js", path.join(rootDir, "exif-prompt-resolver.js")],
  ["/video-prompt-resolver.js", path.join(rootDir, "video-prompt-resolver.js")],
  ["/prompt-similarity.js", path.join(rootDir, "prompt-similarity.js")],
  ["/app.js", path.join(rootDir, "app.js")],
  ["/styles.css", path.join(rootDir, "styles.css")],
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    if (!requestOriginAllowed(req)) {
      return sendJson(res, 403, { error: "local_access_only", message: "로컬 앱 주소에서만 접근할 수 있습니다." });
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/favicon.ico" && (req.method === "GET" || req.method === "HEAD")) {
      res.writeHead(204, { "Cache-Control": "public, max-age=86400" });
      return res.end();
    }
    if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
    if (url.pathname === "/api/state" && req.method === "GET") return sendState(res);
    if (url.pathname === "/api/state" && req.method === "PUT") return saveState(req, res);
    if (url.pathname === "/api/settings" && req.method === "GET") return sendSettings(res);
    if (url.pathname === "/api/settings" && req.method === "PUT") return saveSettings(req, res);
    if (url.pathname === "/api/providers" && req.method === "GET") return sendProviders(res);
    if (url.pathname === "/api/providers" && req.method === "PUT") return saveProviders(req, res);
    if (url.pathname === "/api/providers/test" && req.method === "POST") return testProvider(req, res);
    if (url.pathname === "/api/analyze" && req.method === "POST") return analyzeImage(req, res);
    if (url.pathname === "/api/translate-section" && req.method === "POST") return translateSection(req, res);
    if (url.pathname === "/api/title-summary" && req.method === "POST") return generateTitleSummary(req, res);
    if (url.pathname === "/api/edit-prompt" && req.method === "POST") return editPrompt(req, res);
    if (url.pathname === "/api/tags" && req.method === "GET") return sendTags(res);
    if (url.pathname === "/api/tags" && req.method === "PUT") return saveTags(req, res);
    if (url.pathname === "/api/items" && req.method === "GET") return sendItems(res);
    if (url.pathname === "/api/items" && req.method === "PUT") return saveItems(req, res);
    if (url.pathname === "/api/video-items" && req.method === "GET") return sendVideoItems(res);
    if (url.pathname === "/api/video-items" && req.method === "PUT") return saveVideoItems(req, res);
    if (url.pathname === "/api/video-thumbnail" && req.method === "POST") return extractVideoThumbnail(req, res);
    if (url.pathname === "/api/video-thumbnails" && req.method === "POST") return extractVideoThumbnailSet(req, res);
    if (url.pathname === "/api/wildcards/sync" && req.method === "POST") {
      return syncPromptWildcards(res, url.searchParams.get("mode") || "incremental");
    }
    const itemMatch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemMatch && req.method === "PUT") return saveItem(itemMatch[1], req, res);
    if (itemMatch && req.method === "DELETE") return deleteItem(itemMatch[1], res);
    const videoItemMatch = url.pathname.match(/^\/api\/video-items\/([^/]+)$/);
    if (videoItemMatch && req.method === "PUT") return saveVideoItem(videoItemMatch[1], req, res);
    if (videoItemMatch && req.method === "DELETE") return deleteVideoItem(videoItemMatch[1], res);
    if (url.pathname === "/api/backup" && req.method === "GET") return sendBackup(req, res);
    if (url.pathname === "/api/import" && req.method === "POST") return importBackup(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "internal_server_error", message: "요청 처리 중 오류가 발생했습니다." });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
    console.error(`Prompt Archive may already be running at http://127.0.0.1:${port}`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`Prompt Archive server running at http://${host}:${port}`);
  if (host !== requestedHost) console.warn(`HOST=${requestedHost} ignored because ALLOW_REMOTE is not enabled.`);
  if (allowRemote) console.warn("ALLOW_REMOTE=1: authentication is not enabled; use only on a trusted network.");
  console.log(`Data: ${dataDir}`);
  console.log(`Uploads: ${uploadsDir}`);
});

function sendState(res) {
  const state = readStateFile();
  if (!state) return sendJson(res, 200, { state: null, updatedAt: 0 });
  return sendJson(res, 200, { state, updatedAt: stateUpdatedAt() });
}

function stateUpdatedAt() {
  return [settingsPath, providersPath, tagsPath, itemsPath, videoItemsPath].reduce((latest, filePath) => {
    if (!fs.existsSync(filePath)) return latest;
    return Math.max(latest, fs.statSync(filePath).mtimeMs || 0);
  }, 0);
}

async function saveState(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.state || typeof payload.state !== "object") {
    return sendJson(res, 400, { error: "invalid_state" });
  }
  let state;
  try {
    validateItemsForPersistence(payload.state.items);
    const secrets = readProviderSecrets();
    const protectedProviders = sanitizeProviderList(payload.state.providers, secrets, {
      previousProviders: readProviders(),
      clearChangedSecrets: true,
    });
    if (protectedProviders.secretsChanged) writeJsonFile(providerSecretsPath, secrets);
    state = writeStateFile({ ...payload.state, providers: protectedProviders.providers });
  } catch (error) {
    return sendJson(res, 400, { error: "invalid_state", message: error.message });
  }
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    itemCount: Array.isArray(state.items) ? state.items.length : 0,
    bytes: splitStateBytes(),
  });
}

function sendSettings(res) {
  return sendJson(res, 200, { settings: readSettings() });
}

async function saveSettings(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.settings || typeof payload.settings !== "object") {
    return sendJson(res, 400, { error: "invalid_settings" });
  }
  try {
    writeJsonFile(settingsPath, pickSettings(payload.settings));
  } catch (error) {
    return sendJson(res, 400, {
      error: "invalid_settings",
      message: error.message,
    });
  }
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    bytes: fs.statSync(settingsPath).size,
  });
}

function sendProviders(res) {
  return sendJson(res, 200, { providers: readProviders() });
}

async function saveProviders(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!Array.isArray(payload.providers)) {
    return sendJson(res, 400, { error: "invalid_providers" });
  }
  const secrets = readProviderSecrets();
  const previousByName = new Map(readProviders().map((provider) => [provider.name, provider]));
  let providers;
  try {
    providers = payload.providers.map((provider) => {
      const pendingKey = typeof provider._pendingKey === "string" ? provider._pendingKey.trim() : "";
      const pendingKeySlots = Array.isArray(provider._pendingKeys)
        ? provider._pendingKeys.slice(0, 3).map((key) => String(key || "").trim())
        : [];
      const hasPendingKeySlots = pendingKeySlots.some(Boolean);
      const secretName = normalizeProviderName(provider.name);
      const target = providerCredentialTarget({ ...provider, name: secretName });
      const previousTarget = providerCredentialTarget(previousByName.get(secretName) || { name: secretName });
      if (target !== previousTarget && !pendingKey && !hasPendingKeySlots) delete secrets[secretName];
      if (secretName === "Google Gemini API" && hasPendingKeySlots) {
        const existingKeys = geminiApiKeysFromSecret(secrets[secretName]);
        const mergedKeys = [0, 1, 2].map((slot) => pendingKeySlots[slot] || existingKeys[slot] || "").filter(Boolean);
        secrets[secretName] = { ...(typeof secrets[secretName] === "object" ? secrets[secretName] : {}), apiKeys: mergedKeys, currentKeyIndex: 0 };
      } else if (secretName === "Google Vertex AI" && pendingKey) {
        secrets[secretName] = { ...(typeof secrets[secretName] === "object" ? secrets[secretName] : {}), vertexJson: pendingKey };
      } else if (pendingKey) {
        secrets[secretName] = { ...(typeof secrets[secretName] === "object" ? secrets[secretName] : {}), apiKey: pendingKey };
      }
      const publicProvider = sanitizePublicProvider(provider);
      const secret = secrets[secretName];
      publicProvider.name = secretName;
      publicProvider.keyCount = secretName === "Google Gemini API" ? geminiApiKeysFromSecret(secret).length : undefined;
      publicProvider.currentKeyIndex = secretName === "Google Gemini API" ? Number(secret?.currentKeyIndex || 0) : undefined;
      publicProvider.hasServerKey = providerHasSecret(publicProvider.name, secret);
      return publicProvider;
    });
  } catch (error) {
    return sendJson(res, 400, { error: "invalid_provider_target", message: error.message });
  }
  writeJsonFile(providerSecretsPath, secrets);
  writeJsonFile(providersPath, providers);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    providerCount: providers.length,
    providers,
  });
}

async function testProvider(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  const provider = selectProvider(payload.providerName, "any");
  if (!provider) return sendJson(res, 400, { error: "provider_not_configured", message: "사용 가능한 API 공급자가 없습니다." });
  try {
    await callProvider(provider, {
      prompt: "Reply with a compact JSON object: {\"ok\":true}",
      image: null,
      timeoutSeconds: Math.min(provider.timeoutSeconds || 30, 60),
    });
    return sendJson(res, 200, { ok: true, provider: provider.name });
  } catch (error) {
    return sendJson(res, 502, { error: "provider_test_failed", message: error.message, provider: provider.name });
  }
}

async function analyzeImage(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  const provider = selectProvider(null, "useForImageAnalysis");
  if (!provider) return sendJson(res, 400, { error: "provider_not_configured", message: "이미지 분석에 사용할 API 공급자가 없습니다." });

  const image = readRequestImage(payload.item || {});
  if (!image) {
    return sendJson(res, 400, {
      error: "missing_image",
      message: "분석할 이미지가 서버 요청에 포함되지 않았습니다.",
      provider: provider.name,
    });
  }

  let rawText = "";
  try {
    rawText = await callProvider(provider, {
      prompt: payload.request || "",
      image,
      timeoutSeconds: provider.timeoutSeconds || 60,
    });
    const parsed = parseProviderJson(rawText);
    const normalized = normalizeProviderResult(parsed);
    return sendJson(res, 200, { ok: true, provider: provider.name, ...normalized });
  } catch (error) {
    console.error("[analysis_failed]", {
      provider: provider.name,
      message: error.message,
      rawPreview: String(rawText || "").slice(0, 1500),
      stack: error.stack,
    });
    return sendJson(res, 502, { error: "analysis_failed", message: error.message, provider: provider.name });
  }
}

async function translateSection(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  const provider = selectProvider(null, "useForTranslation");
  if (!provider) return sendJson(res, 400, { error: "provider_not_configured", message: "한국어 번역에 사용할 API 공급자가 없습니다." });
  const sentences = Array.isArray(payload.sentences) ? payload.sentences.map((sentence, index) => ({
    id: String(sentence.id || `sentence-${index + 1}`),
    en: String(sentence.en || "").trim(),
  })).filter((sentence) => sentence.en) : [];
  if (!sentences.length) return sendJson(res, 400, { error: "empty_sentences", message: "번역할 영어 문장이 없습니다." });
  const prompt = [
    "Translate the English prompt sentences into natural Korean.",
    "Return strict JSON only. Do not add markdown.",
    "Keep the same sentence ids. Do not add meaning that is not present in English. Do not omit meaning.",
    "Output format: {\"translations\":[{\"id\":\"...\",\"ko\":\"...\"}]}",
    `Section: ${String(payload.sectionLabel || payload.sectionKey || "").trim()}`,
    `Sentences: ${JSON.stringify(sentences)}`,
  ].join("\n");
  try {
    const text = await callProvider(provider, {
      prompt,
      image: null,
      timeoutSeconds: provider.timeoutSeconds || 60,
    });
    const parsed = parseProviderJson(text);
    const translations = normalizeSectionTranslations(parsed, sentences);
    return sendJson(res, 200, { ok: true, provider: provider.name, translations });
  } catch (error) {
    return sendJson(res, 502, { error: "translation_failed", message: error.message, provider: provider.name });
  }
}

async function editPrompt(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  const provider = selectProvider(null, "useForTranslation");
  if (!provider) {
    return sendJson(res, 400, {
      error: "provider_not_configured",
      message: "프롬프트 수정에 사용할 번역·텍스트 공급자가 없습니다.",
    });
  }

  const sourceSections = payload.promptJson || payload.promptSections || {};
  const sectionKeys = ["appearance", "outfit", "background", "expression_pose", "details"];
  const compactSections = {};
  let sentenceCount = 0;
  for (const key of sectionKeys) {
    const section = sourceSections[key] || {};
    const sentences = Array.isArray(section.sentences) ? section.sentences : Array.isArray(section) ? section : [];
    const normalized = sentences.map((sentence, index) => ({
      id: String(sentence.id || `${key}-${index + 1}`),
      en: String(sentence.en || "").trim(),
      ko: String(sentence.ko || "").trim(),
    })).filter((sentence) => sentence.en || sentence.ko);
    if (normalized.length) {
      compactSections[key] = {
        title_ko: String(section.title_ko || "").trim(),
        sentences: normalized,
      };
      sentenceCount += normalized.length;
    }
  }
  if (!sentenceCount) {
    return sendJson(res, 400, { error: "empty_prompt", message: "수정할 현재 프롬프트가 없습니다." });
  }

  const customInstruction = String(payload.customInstruction || "").trim();
  const excludeLabels = Array.isArray(payload.excludeLabels)
    ? payload.excludeLabels.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
  if (!customInstruction && !excludeLabels.length) {
    return sendJson(res, 400, {
      error: "empty_edit_request",
      message: "추가 요청사항 또는 제외 요소를 하나 이상 지정해 주세요.",
    });
  }

  const prompt = [
    "You are editing an existing AI image prompt archive entry.",
    "Do NOT re-analyze any image. Work only from the provided prompt JSON.",
    "Apply the user edit request and exclusion list with MINIMAL text changes.",
    "Return strict JSON only. No markdown.",
    "",
    "Output format:",
    "{\"promptSections\":{",
    "  \"appearance\":[{\"id\":\"...\",\"en\":\"...\",\"ko\":\"...\"}],",
    "  \"outfit\":[{\"id\":\"...\",\"en\":\"...\",\"ko\":\"...\"}],",
    "  \"background\":[{\"id\":\"...\",\"en\":\"...\",\"ko\":\"...\"}],",
    "  \"expression_pose\":[{\"id\":\"...\",\"en\":\"...\",\"ko\":\"...\"}],",
    "  \"details\":[{\"id\":\"...\",\"en\":\"...\",\"ko\":\"...\"}]",
    "}}",
    "",
    "Rules:",
    "- Keep the same section keys and the same sentence ids whenever possible.",
    "- Prefer deleting/rewriting only the phrases that must change.",
    "- Do not rewrite the whole prompt from scratch.",
    "- Do not invent major new scene facts unless the user request explicitly asks for them.",
    "- If an element is listed under exclusions, remove descriptions of that element even if visible in the old text.",
    "- Keep English and Korean aligned 1:1 for each sentence id.",
    "- Preserve overall style, structure, and high visual density.",
    "- If a section needs no change, return it almost unchanged.",
    "- Appearance: stable physical appearance only; no expression, gaze, pose, action, framing, background, clothing, accessories, or held objects.",
    "- Outfit: clothing, accessories, wearable items, and held objects only. Personal accessories and carried items such as bags, phones, sunglasses, eyeglasses, umbrellas, and wallets stay in Outfit even when temporarily set on a seat, table, floor, or beside the subject; no pose, action, background, framing, gaze, or expression.",
    "- Background: environment, location, furniture, architecture, and ambient scene elements only. Retail merchandise and shared scene props that do not belong to the subject stay in Background; no subject appearance, personal accessories, outfit, pose, action, body placement, gaze, expression, camera angle, or composition.",
    "- Expression / Pose: pose, action, body placement, hand position, leg position, camera angle, framing, crop, gaze, head angle, and expression only. A personal item may be referenced only generically when needed to describe interaction; never describe its color, material, brand, size, or style here. No stable appearance, outfit details, location, architecture, furniture, or background scenery.",
    "- Details: technical image quality, lighting, realism, camera style, texture, color, grain, blur, sharpness, and exclusions only.",
    "- When the old text is misclassified, move or rewrite the affected information into the correct section even if the user request concerns another detail.",
    "",
    `User additional request: ${customInstruction || "(none)"}`,
    `Elements to remove/exclude from the prompt: ${excludeLabels.length ? excludeLabels.join(", ") : "(none)"}`,
    "",
    "Current prompt JSON:",
    JSON.stringify(compactSections).slice(0, 12000),
  ].join("\n");

  try {
    const text = await callProvider(provider, {
      prompt,
      image: null,
      timeoutSeconds: provider.timeoutSeconds || 60,
    });
    const parsed = parseProviderJson(text);
    const normalized = normalizeProviderResult(parsed);
    const merged = mergeEditedPromptSections(compactSections, normalized.promptJson);
    return sendJson(res, 200, {
      ok: true,
      provider: provider.name,
      promptJson: merged,
    });
  } catch (error) {
    return sendJson(res, 502, {
      error: "edit_prompt_failed",
      message: error.message,
      provider: provider.name,
    });
  }
}

function mergeEditedPromptSections(sourceSections, editedSections) {
  const keys = ["appearance", "outfit", "background", "expression_pose", "details"];
  return Object.fromEntries(keys.map((key) => {
    const source = sourceSections[key] || { title_ko: "", sentences: [] };
    const edited = editedSections?.[key] || {};
    const editedSentences = Array.isArray(edited.sentences) ? edited.sentences : [];
    const byId = new Map(editedSentences.map((sentence) => [String(sentence.id || ""), sentence]));
    let sentences = (source.sentences || []).map((sentence, index) => {
      const match = byId.get(String(sentence.id || "")) || editedSentences[index];
      if (!match) return sentence;
      return {
        id: sentence.id,
        en: String(match.en || sentence.en || "").trim(),
        ko: String(match.ko || sentence.ko || "").trim(),
      };
    }).filter((sentence) => sentence.en || sentence.ko);

    // If model returns new sentence ids only, fall back to edited list.
    if (!sentences.length && editedSentences.length) {
      sentences = editedSentences.map((sentence, index) => ({
        id: String(sentence.id || `${key}-${index + 1}`),
        en: String(sentence.en || "").trim(),
        ko: String(sentence.ko || "").trim(),
      })).filter((sentence) => sentence.en || sentence.ko);
    }

    return [key, {
      title_ko: String(edited.title_ko || source.title_ko || "").trim(),
      sentences,
    }];
  }));
}

async function generateTitleSummary(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  // Title summary shares the translation provider role (text-only Korean labeling).
  const provider = selectProvider(null, "useForTranslation");
  if (!provider) {
    return sendJson(res, 400, {
      error: "provider_not_configured",
      message: "번역·제목 요약에 사용할 API 공급자가 없습니다.",
    });
  }

  const promptText = String(payload.promptText || "").trim();
  const sections = payload.sections && typeof payload.sections === "object" ? payload.sections : {};
  const sectionLines = ["appearance", "outfit", "background", "expression_pose", "details"]
    .map((key) => {
      const value = String(sections[key] || "").trim();
      return value ? `${key}: ${value}` : "";
    })
    .filter(Boolean);
  // Tags are local; only place/background tags are useful title context.
  const placeTags = Array.isArray(payload.backgroundTags)
    ? payload.backgroundTags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : Array.isArray(payload.placeTags)
      ? payload.placeTags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];
  const source = [promptText, ...sectionLines].join("\n").trim();
  if (!source) {
    return sendJson(res, 400, { error: "empty_prompt", message: "제목 요약에 사용할 프롬프트가 없습니다." });
  }

  const prompt = [
    "You write short Korean album titles for an AI image prompt archive.",
    "Read the prompt sections and place tags, then pick only the high-signal keywords for a title line.",
    "Return strict JSON only. No markdown.",
    "Output format: {\"titleSummary\":\"...\"}",
    "",
    "Rules:",
    "- Korean only.",
    "- Keyword style only: short nouns/adjective+noun chunks separated by spaces. No full sentences, no verbs like \"하고 있다\", no ~한/~인 문장체.",
    "- About 3-7 keywords (roughly 12-40 characters, max 60).",
    "",
    "INCLUDE only these (priority order):",
    "1) Hairstyle (장발, 단발, 포니테일, 웨이브, 업스타일, 뱅 등)",
    "2) Outfit / clothing color+type (화이트 원피스, 니트 크롭탑, 청치마 등)",
    "3) Handheld items, accessories, bag (숄더백, 캐리어, 선글라스, 목걸이, 이어폰, 폰 등)",
    "4) Background / place type (호텔 복도, 카페, 거리, 침실, 엘리베이터 등)",
    "",
    "EXCLUDE always (never put these in the title):",
    "- 여성 / 여자 / woman / girl / 인물 성별 표현 (all photos are women)",
    "- 피부 / 톤 / 도자기 / porcelain / fair skin / 피부결 / 메이크업 피부 표현",
    "- 스냅 / 전신 / 상반신 / 클로즈업 / 구도 / 포즈 일반어 / 카메라 표현",
    "- 조명 / 빛 / 라이팅 / soft light / 스튜디오 조명",
    "- 분위기·감정만 있는 단어 (섹시, 몽환, 분위기 등) unless tied to a concrete object",
    "",
    "- Use place tags only as location hints; do not invent unrelated places.",
    "- Do not copy English prompt fragments.",
    "- Do not use filenames, hashes, ids, or source names.",
    "- Prefer concrete visual nouns over vague mood words.",
    "- Examples: \"장발 화이트 원피스 숄더백 호텔 복도\", \"포니테일 청치마 캐리어 공항\", \"단발 니트 크롭탑 카페 창가\", \"웨이브 블랙 드레스 클러치 엘리베이터\"",
    "",
    placeTags.length ? `Place tags: ${placeTags.join(", ")}` : "Place tags: (none)",
    "",
    "Prompt content:",
    source.slice(0, 6000),
  ].join("\n");

  try {
    const text = await callProvider(provider, {
      prompt,
      image: null,
      timeoutSeconds: Math.min(provider.timeoutSeconds || 60, 60),
    });
    const parsed = parseProviderJson(text);
    const titleSummary = cleanGeneratedTitleSummary(
      parsed.titleSummary || parsed.title || parsed.summary || parsed.ko || ""
    );
    if (!titleSummary) {
      return sendJson(res, 502, {
        error: "title_summary_empty",
        message: "API가 유효한 한글 제목을 반환하지 않았습니다.",
        provider: provider.name,
      });
    }
    return sendJson(res, 200, { ok: true, provider: provider.name, titleSummary });
  } catch (error) {
    return sendJson(res, 502, {
      error: "title_summary_failed",
      message: error.message,
      provider: provider.name,
    });
  }
}

function cleanGeneratedTitleSummary(value) {
  let text = String(value || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\.(jpe?g|png|webp|gif|bmp|avif)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length > 60) {
    text = text.slice(0, 60).replace(/\s+\S*$/, "").trim();
  }
  const hangul = (text.match(/[가-힣]/g) || []).length;
  if (hangul < 2) return "";
  return text;
}

function sendTags(res) {
  return sendJson(res, 200, { tags: readTags() });
}

async function saveTags(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.tags || typeof payload.tags !== "object") {
    return sendJson(res, 400, { error: "invalid_tags" });
  }
  writeJsonFile(tagsPath, payload.tags);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    bytes: fs.statSync(tagsPath).size,
  });
}

function sendItems(res) {
  return sendJson(res, 200, { items: readItems() });
}

async function saveItems(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!Array.isArray(payload.items)) {
    return sendJson(res, 400, { error: "invalid_items" });
  }
  try {
    validateItemsForPersistence(payload.items);
  } catch (error) {
    return sendJson(res, 400, { error: "invalid_items", message: error.message });
  }
  const items = payload.items.map((item) => persistItemImages(item));
  writeJsonFile(itemsPath, items);
  // Bulk delete / full list replace: drop any uploads no longer referenced.
  const prunedImageCount = pruneUploadsOutside(unionUploadNames(items, readVideoItems()));
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    itemCount: items.length,
    prunedImageCount,
    bytes: fs.statSync(itemsPath).size,
  });
}

async function saveItem(id, req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.item || typeof payload.item !== "object") {
    return sendJson(res, 400, { error: "invalid_item" });
  }
  let itemId;
  try {
    itemId = decodeURIComponent(id);
  } catch (_error) {
    return sendJson(res, 400, { error: "invalid_item_id" });
  }
  const candidate = { ...payload.item, id: itemId };
  try {
    validateItemsForPersistence([candidate]);
  } catch (error) {
    return sendJson(res, 400, { error: "invalid_item", message: error.message });
  }
  const items = readItems();
  const previous = items.find((entry) => entry.id === itemId) || null;
  const item = persistItemImages(candidate);
  const index = items.findIndex((entry) => entry.id === itemId);
  if (index >= 0) items[index] = item;
  else items.unshift(item);
  writeJsonFile(itemsPath, items);
  // If image assets changed, remove previous files that no other item still uses.
  let deletedImageCount = 0;
  if (previous) {
    const previousNames = collectUploadNamesFromItems([previous]);
    const keptNames = unionUploadNames(items, readVideoItems());
    deletedImageCount = deleteUploadFiles([...previousNames].filter((name) => !keptNames.has(name)));
  }
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    id: item.id,
    deletedImageCount,
  });
}

function deleteItem(id, res) {
  const existing = readItems();
  const removed = existing.find((item) => item.id === id) || null;
  const items = existing.filter((item) => item.id !== id);
  writeJsonFile(itemsPath, items);
  const removedNames = collectUploadNamesFromItems(removed ? [removed] : []);
  const keptNames = unionUploadNames(items, readVideoItems());
  const toDelete = [...removedNames].filter((name) => !keptNames.has(name));
  const deletedImageCount = deleteUploadFiles(toDelete);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    id,
    itemCount: items.length,
    deletedImageCount,
  });
}

function sendVideoItems(res) {
  return sendJson(res, 200, { videoItems: readVideoItems() });
}

async function saveVideoItems(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!Array.isArray(payload.videoItems)) {
    return sendJson(res, 400, { error: "invalid_video_items" });
  }
  try {
    validateItemsForPersistence(payload.videoItems);
  } catch (error) {
    return sendJson(res, 400, { error: "invalid_video_items", message: error.message });
  }
  const videoItems = payload.videoItems.map((item) => persistItemImages(item));
  writeJsonFile(videoItemsPath, videoItems);
  const prunedImageCount = pruneUploadsOutside(unionUploadNames(readItems(), videoItems));
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    itemCount: videoItems.length,
    prunedImageCount,
    bytes: fs.statSync(videoItemsPath).size,
  });
}

async function saveVideoItem(id, req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.item || typeof payload.item !== "object") {
    return sendJson(res, 400, { error: "invalid_video_item" });
  }
  let itemId;
  try {
    itemId = decodeURIComponent(id);
  } catch (_error) {
    return sendJson(res, 400, { error: "invalid_video_item_id" });
  }
  const candidate = { ...payload.item, id: itemId };
  try {
    validateItemsForPersistence([candidate]);
  } catch (error) {
    return sendJson(res, 400, { error: "invalid_video_item", message: error.message });
  }
  const videoItems = readVideoItems();
  const previous = videoItems.find((entry) => entry.id === itemId) || null;
  const item = persistItemImages(candidate);
  const index = videoItems.findIndex((entry) => entry.id === itemId);
  if (index >= 0) videoItems[index] = item;
  else videoItems.unshift(item);
  writeJsonFile(videoItemsPath, videoItems);
  let deletedImageCount = 0;
  if (previous) {
    const previousNames = collectUploadNamesFromItems([previous]);
    const keptNames = unionUploadNames(readItems(), videoItems);
    deletedImageCount = deleteUploadFiles([...previousNames].filter((name) => !keptNames.has(name)));
  }
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    id: item.id,
    deletedImageCount,
  });
}

function deleteVideoItem(id, res) {
  const existing = readVideoItems();
  const removed = existing.find((item) => item.id === id) || null;
  const videoItems = existing.filter((item) => item.id !== id);
  writeJsonFile(videoItemsPath, videoItems);
  const removedNames = collectUploadNamesFromItems(removed ? [removed] : []);
  const keptNames = unionUploadNames(readItems(), videoItems);
  const toDelete = [...removedNames].filter((name) => !keptNames.has(name));
  const deletedImageCount = deleteUploadFiles(toDelete);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    id,
    itemCount: videoItems.length,
    deletedImageCount,
  });
}

function resolveBinaryPath(envName, fileName) {
  const candidates = [
    process.env[envName],
    `C:\\ffmpeg\\bin\\${fileName}`,
    fileName.replace(/\.exe$/i, ""),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("\\") || candidate.includes("/")) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(candidate, ["-version"], { timeout: 8000, windowsHide: true });
    if (probe.status === 0) return candidate;
  }
  return "";
}

function resolveFfmpegPath() {
  return resolveBinaryPath("FFMPEG_PATH", "ffmpeg.exe");
}

function resolveFfprobePath() {
  return resolveBinaryPath("FFPROBE_PATH", "ffprobe.exe");
}

function probeVideoDuration(ffprobePath, inputPath) {
  if (!ffprobePath) return 0;
  const result = spawnSync(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ], { timeout: 20000, windowsHide: true, encoding: "utf8" });
  const value = Number(String(result.stdout || "").trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function probeVideoSize(ffprobePath, inputPath) {
  if (!ffprobePath) return { width: 0, height: 0 };
  const result = spawnSync(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:stream_tags=rotate:stream_side_data=rotation",
    "-of",
    "json",
    inputPath,
  ], { timeout: 20000, windowsHide: true, encoding: "utf8" });
  try {
    const parsed = JSON.parse(String(result.stdout || "{}"));
    const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
    let width = Number(stream?.width) || 0;
    let height = Number(stream?.height) || 0;
    const sideRotation = Number(stream?.side_data_list?.find((entry) => entry && entry.rotation != null)?.rotation || 0);
    const rotate = Number(stream?.tags?.rotate || sideRotation || 0);
    if (width && height && (Math.abs(rotate) === 90 || Math.abs(rotate) === 270)) {
      const swapped = width;
      width = height;
      height = swapped;
    }
    return { width, height };
  } catch (_error) {
    return { width: 0, height: 0 };
  }
}

function probeVideoInfo(ffprobePath, inputPath) {
  const duration = probeVideoDuration(ffprobePath, inputPath);
  const size = probeVideoSize(ffprobePath, inputPath);
  return { duration, width: size.width, height: size.height };
}

function thumbnailSeekTimes(duration, count) {
  const total = Math.max(2, Math.min(12, Math.trunc(Number(count) || 6)));
  const length = Math.max(0.2, Number(duration) || 0);
  const times = [];
  for (let index = 0; index < total; index += 1) {
    const raw = length * index / (total - 1);
    const clamped = index === 0 ? 0 : Math.min(raw, Math.max(0, length - 0.04));
    times.push(Number(clamped.toFixed(3)));
  }
  return times;
}

function videoUploadExtension(fileName, mime) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if ([".webm", ".mp4", ".mov", ".mkv"].includes(ext)) return ext;
  if (/webm/i.test(mime)) return ".webm";
  if (/mp4|mpeg/i.test(mime)) return ".mp4";
  if (/quicktime/i.test(mime)) return ".mov";
  return ".webm";
}

function runFfmpegFrame(ffmpegPath, inputPath, outputPath, extraArgs) {
  return spawnSync(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...extraArgs,
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-an",
    outputPath,
  ], { timeout: 90000, windowsHide: true, encoding: "utf8" });
}

function runFfmpegTimedFrame(ffmpegPath, inputPath, outputPath, seek) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (Number(seek) > 0) args.push("-ss", String(seek));
  args.push("-i", inputPath, "-frames:v", "1", "-an", "-vf", "scale=-2:480", outputPath);
  return spawnSync(ffmpegPath, args, { timeout: 90000, windowsHide: true, encoding: "utf8" });
}

async function extractVideoThumbnail(req, res) {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    return sendJson(res, 503, {
      error: "ffmpeg_missing",
      message: "ffmpeg를 찾지 못했습니다. 브라우저 프레임 추출을 사용합니다.",
    });
  }
  const fileName = decodeURIComponent(String(req.headers["x-file-name"] || "video.webm"));
  const mime = String(req.headers["content-type"] || "");
  const body = await readBinaryBody(req);
  if (!body || !body.length) {
    return sendJson(res, 400, { error: "empty_video", message: "비디오 데이터가 비어 있습니다." });
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-vid-"));
  const inputPath = path.join(tmpDir, `in${videoUploadExtension(fileName, mime)}`);
  const outputPath = path.join(tmpDir, "frame.webp");
  try {
    fs.writeFileSync(inputPath, body);
    let result = runFfmpegFrame(ffmpegPath, inputPath, outputPath, []);
    if (result.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 32) {
      result = runFfmpegFrame(ffmpegPath, inputPath, outputPath, ["-ss", "0.08"]);
    }
    if (result.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 32) {
      return sendJson(res, 422, {
        error: "thumbnail_failed",
        message: (result.stderr || result.stdout || "첫 프레임을 추출하지 못했습니다.").trim(),
      });
    }
    const frame = fs.readFileSync(outputPath);
    return sendJson(res, 200, {
      ok: true,
      mime: "image/webp",
      size: frame.length,
      dataUrl: `data:image/webp;base64,${frame.toString("base64")}`,
    });
  } catch (error) {
    return sendJson(res, 500, { error: "thumbnail_failed", message: error.message });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_error) {
      // ignore temp cleanup
    }
  }
}

async function extractVideoThumbnailSet(req, res) {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    return sendJson(res, 503, {
      error: "ffmpeg_missing",
      message: "ffmpeg를 찾지 못했습니다.",
    });
  }
  const fileName = decodeURIComponent(String(req.headers["x-file-name"] || "video.webm"));
  const mime = String(req.headers["content-type"] || "");
  const count = Number(req.headers["x-frame-count"] || 6);
  const body = await readBinaryBody(req);
  if (!body || !body.length) {
    return sendJson(res, 400, { error: "empty_video", message: "비디오 데이터가 비어 있습니다." });
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-vid-set-"));
  const inputPath = path.join(tmpDir, `in${videoUploadExtension(fileName, mime)}`);
  try {
    fs.writeFileSync(inputPath, body);
    const info = probeVideoInfo(resolveFfprobePath(), inputPath);
    const duration = info.duration;
    const times = thumbnailSeekTimes(duration || 8, count);
    const frames = [];
    for (let index = 0; index < times.length; index += 1) {
      const outputPath = path.join(tmpDir, `frame-${index}.webp`);
      const seek = times[index];
      let result = runFfmpegTimedFrame(ffmpegPath, inputPath, outputPath, seek);
      if ((result.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 32) && seek > 0) {
        result = runFfmpegTimedFrame(ffmpegPath, inputPath, outputPath, Math.max(0, seek - 0.12));
      }
      if (result.status !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 32) continue;
      const frame = fs.readFileSync(outputPath);
      frames.push({
        index,
        time: seek,
        percent: times.length > 1 ? Math.round(index * 100 / (times.length - 1)) : 0,
        mime: "image/webp",
        size: frame.length,
        dataUrl: `data:image/webp;base64,${frame.toString("base64")}`,
      });
    }
    if (!frames.length) {
      return sendJson(res, 422, { error: "thumbnail_failed", message: "구간 썸네일을 추출하지 못했습니다." });
    }
    return sendJson(res, 200, {
      ok: true,
      duration,
      width: info.width,
      height: info.height,
      frames,
    });
  } catch (error) {
    return sendJson(res, 500, { error: "thumbnail_failed", message: error.message });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_error) {
      // ignore temp cleanup
    }
  }
}

function sendBackup(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const includeSecrets = url.searchParams.get("includeSecrets") === "1" && isLoopbackAddress(req.socket.remoteAddress);
  const payload = createBackupPayload(includeSecrets);
  const body = JSON.stringify(payload);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileLabel = includeSecrets ? "prompt-archive-backup-WITH-SECRETS" : "prompt-archive-backup";
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${fileLabel}-${stamp}.json"`,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function importBackup(req, res) {
  try {
    const body = await readBody(req);
    const raw = JSON.parse(body || "{}");
    const backup = normalizeIncomingBackup(raw);
    if (!backup) {
      return sendJson(res, 400, {
        error: "invalid_backup",
        message: "지원하지 않는 백업 형식입니다. prompt-archive-backup JSON 파일을 선택하세요.",
      });
    }

    const mode = String(raw.mode || backup.mode || "replace").toLowerCase() === "merge" ? "merge" : "replace";
    validateBackupForImport(backup, mode);
    const safetyBackupFile = createPreImportSafetyBackup();
    const secretEntries = backup.providerSecrets && typeof backup.providerSecrets === "object"
      ? Object.keys(backup.providerSecrets)
      : [];
    const includeSecrets = Boolean(backup.includeSecrets) && secretEntries.length > 0;

    let settings = backup.settings && typeof backup.settings === "object" ? backup.settings : readSettings();
    let tags = backup.tags && typeof backup.tags === "object" ? backup.tags : readTags();
    // Legacy client export put tag lists inside settings.
    if (!backup.tags && backup.settings && typeof backup.settings === "object") {
      const legacyTags = pickTags(backup.settings);
      if (legacyTags.excludeOptions.length || legacyTags.outfitTagOptions.length || legacyTags.backgroundTagOptions.length) {
        tags = legacyTags;
      }
      settings = pickSettings(backup.settings);
    }

    let providers = Array.isArray(backup.providers) ? backup.providers : readProviders();
    let items = Array.isArray(backup.items) ? backup.items : [];
    let videoItems = Array.isArray(backup.videoItems) ? backup.videoItems : (mode === "merge" ? readVideoItems() : []);
    const images = backup.images && typeof backup.images === "object" ? backup.images : {};

    if (mode === "merge") {
      const existingItems = readItems();
      const byId = new Map(existingItems.map((item) => [item.id, item]));
      items.forEach((item) => {
        if (item?.id) byId.set(item.id, item);
      });
      items = [...byId.values()];
      const existingVideoItems = readVideoItems();
      const videoById = new Map(existingVideoItems.map((item) => [item.id, item]));
      videoItems.forEach((item) => {
        if (item?.id) videoById.set(item.id, item);
      });
      videoItems = [...videoById.values()];
      // Keep current settings/tags/providers unless backup provided them.
      if (!backup.settings) settings = readSettings();
      if (!backup.tags && !(backup.settings && (backup.settings.excludeOptions || backup.settings.outfitTagOptions))) tags = readTags();
      if (!Array.isArray(backup.providers)) providers = readProviders();
    }

    const currentSecrets = includeSecrets ? structuredCloneCompat(backup.providerSecrets) : readProviderSecrets();
    let clearedSecretCount = 0;
    if (!includeSecrets && Array.isArray(backup.providers)) {
      for (const provider of backup.providers) {
        const name = normalizeProviderName(provider?.name);
        if (name && Object.prototype.hasOwnProperty.call(currentSecrets, name)) {
          delete currentSecrets[name];
          clearedSecretCount += 1;
        }
      }
    }
    const sanitizedProviders = sanitizeProviderList(providers, currentSecrets).providers;
    items = items.map((item) => persistItemImages(item));
    videoItems = videoItems.map((item) => persistItemImages(item));
    const writtenImages = writeBackupImages(images);
    writeJsonFile(settingsPath, pickSettings({ ...settings }));
    writeJsonFile(tagsPath, pickTags({ ...tags, ...settings }));
    writeJsonFile(providersPath, sanitizedProviders);
    if (includeSecrets || clearedSecretCount) {
      writeJsonFile(providerSecretsPath, currentSecrets);
    }
    writeJsonFile(itemsPath, items);
    writeJsonFile(videoItemsPath, videoItems);

    const referenced = unionUploadNames(items, videoItems);
    const pruned = pruneUploadsOutside(referenced);

    return sendJson(res, 200, {
      ok: true,
      mode,
      updatedAt: Date.now(),
      itemCount: items.length,
      imageCount: writtenImages,
      prunedImageCount: pruned,
      includeSecrets,
      clearedSecretCount,
      safetyBackupFile,
    });
  } catch (error) {
    console.error("[import_failed]", error);
    return sendJson(res, 400, {
      error: "import_failed",
      message: error.message || "백업 가져오기에 실패했습니다.",
    });
  }
}

function normalizeIncomingBackup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw.backup && typeof raw.backup === "object" ? raw.backup : raw;
  if (candidate.format === "prompt-archive-backup") return candidate;
  // Legacy browser export from exportArchiveBackup()
  if (candidate.exportedAt && (Array.isArray(candidate.items) || candidate.settings)) {
    return {
      format: "prompt-archive-backup",
      version: 1,
      exportedAt: candidate.exportedAt,
      settings: candidate.settings || null,
      tags: candidate.tags || null,
      providers: candidate.providers,
      providerSecrets: candidate.providerSecrets,
      items: candidate.items || [],
      videoItems: candidate.videoItems || [],
      images: candidate.images || {},
    };
  }
  // Full app state dump (JSON 백업 클립보드 형식)
  if (Array.isArray(candidate.items) && (candidate.theme || candidate.promptInstruction || candidate.categories)) {
    return {
      format: "prompt-archive-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: pickSettings(candidate),
      tags: pickTags(candidate),
      providers: candidate.providers,
      items: candidate.items || [],
      videoItems: candidate.videoItems || [],
      images: candidate.images || {},
    };
  }
  return null;
}

function createBackupPayload(includeSecrets) {
  const items = readItems();
  const videoItems = readVideoItems();
  const settings = readSettings();
  const tags = readTags();
  const providers = readProviders();
  const secrets = readProviderSecrets();
  const imageNames = unionUploadNames(items, videoItems);
  const images = {};
  for (const name of imageNames) {
    const filePath = path.join(uploadsDir, name);
    try {
      ensureInside(uploadsDir, filePath);
    } catch {
      continue;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    images[name] = fs.readFileSync(filePath).toString("base64");
  }
  const payload = {
    format: "prompt-archive-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    tags,
    providers,
    includeSecrets: Boolean(includeSecrets),
    items,
    videoItems,
    images,
    stats: {
      itemCount: items.length,
      videoItemCount: videoItems.length,
      imageCount: Object.keys(images).length,
      providerCount: providers.length,
    },
  };
  if (includeSecrets) payload.providerSecrets = secrets;
  return payload;
}

function unionUploadNames(...lists) {
  const names = new Set();
  for (const list of lists) {
    for (const name of collectUploadNamesFromItems(list)) names.add(name);
  }
  return names;
}

function collectUploadNamesFromItems(items) {
  const names = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    const match = value.match(/^\/uploads\/([^/?#]+)$/);
    if (match) {
      try {
        names.add(safeUploadFileName(match[1]));
      } catch {
        // ignore invalid names
      }
    }
  };
  for (const item of Array.isArray(items) ? items : []) {
    add(item.imageUrl);
    add(item.thumbnailUrl);
    add(item.displayImage?.dataUrl);
    add(item.thumbnailImage?.dataUrl);
    add(item.analysisImage?.dataUrl);
    add(item.originalImage?.dataUrl);
  }
  return names;
}

function writeBackupImages(images) {
  const prepared = [];
  for (const [rawName, base64] of Object.entries(images || {})) {
    if (typeof base64 !== "string" || !base64) continue;
    const name = safeUploadFileName(rawName);
    const buffer = Buffer.from(base64, "base64");
    validateImportedImage(name, buffer);
    prepared.push({ name, buffer });
  }
  for (const { name, buffer } of prepared) {
    const filePath = path.join(uploadsDir, name);
    ensureInside(uploadsDir, filePath);
    fs.writeFileSync(filePath, buffer);
  }
  return prepared.length;
}

function validateImportedImage(name, buffer) {
  const ext = path.extname(name).toLowerCase();
  if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024) throw new Error(`Invalid image size: ${name}`);
  const png = ext === ".png" && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = [".jpg", ".jpeg"].includes(ext) && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = ext === ".webp" && buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new Error(`Unsupported or invalid backup image: ${name}`);
}

function validateBackupForImport(backup, mode) {
  if (Number(backup.version || 1) !== 1) throw new Error("지원하지 않는 백업 버전입니다.");
  if (mode === "replace" && !Array.isArray(backup.items)) throw new Error("교체 백업에는 items 배열이 필요합니다.");
  if (Array.isArray(backup.items)) validateItemsForPersistence(backup.items);
  if (Array.isArray(backup.videoItems)) validateItemsForPersistence(backup.videoItems);
}

function validateItemsForPersistence(items) {
  if (!Array.isArray(items)) throw new Error("게시물 목록이 배열이 아닙니다.");
  if (items.length > 100000) throw new Error("게시물 수가 허용 범위를 초과했습니다.");
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object" || !/^[a-zA-Z0-9_-]{1,128}$/.test(String(item.id || ""))) {
      throw new Error("게시물 ID가 올바르지 않습니다.");
    }
    if (ids.has(item.id)) throw new Error(`중복된 게시물 ID가 있습니다: ${item.id}`);
    ids.add(item.id);
    validateImageReference(item.imageUrl);
    validateImageReference(item.thumbnailUrl);
    for (const field of ["displayImage", "thumbnailImage", "analysisImage", "originalImage"]) {
      if (item[field] != null && typeof item[field] !== "object") throw new Error(`${field} 이미지 정보가 올바르지 않습니다.`);
      validateImageReference(item[field]?.dataUrl);
    }
  }
}

function validateImageReference(value) {
  const source = String(value || "").trim();
  if (!source) return;
  const uploadMatch = source.match(/^\/uploads\/([^/?#]+)$/);
  if (uploadMatch) {
    safeUploadFileName(uploadMatch[1]);
    return;
  }
  if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)(?:;charset=[^;,]+)?(?:;base64)?,/i.test(source)) return;
  throw new Error("외부 또는 지원하지 않는 이미지 주소가 포함되어 있습니다.");
}

function createPreImportSafetyBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `pre-import-${stamp}.json`;
  writeJsonFile(path.join(backupDir, fileName), createBackupPayload(true));
  return fileName;
}

function pruneUploadsOutside(allowedNames) {
  if (!fs.existsSync(uploadsDir)) return 0;
  let pruned = 0;
  for (const name of fs.readdirSync(uploadsDir)) {
    const filePath = path.join(uploadsDir, name);
    if (!fs.statSync(filePath).isFile()) continue;
    if (allowedNames.has(name)) continue;
    try {
      fs.unlinkSync(filePath);
      pruned += 1;
    } catch (error) {
      console.warn(`Failed to prune upload ${name}:`, error.message);
    }
  }
  return pruned;
}

function deleteUploadFiles(names) {
  let deleted = 0;
  for (const rawName of names || []) {
    let name;
    try {
      name = safeUploadFileName(rawName);
    } catch {
      continue;
    }
    const filePath = path.join(uploadsDir, name);
    try {
      ensureInside(uploadsDir, filePath);
    } catch {
      continue;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    try {
      fs.unlinkSync(filePath);
      deleted += 1;
    } catch (error) {
      console.warn(`Failed to delete upload ${name}:`, error.message);
    }
  }
  return deleted;
}

function safeUploadFileName(name) {
  const normalized = String(name || "").replace(/\\/g, "/");
  const base = path.basename(normalized);
  if (!base || base === "." || base === ".." || normalized !== base) {
    throw new Error(`Invalid image name: ${name}`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw new Error(`Invalid image name: ${name}`);
  }
  return base;
}

function readStateFile() {
  const splitState = readSplitState();
  if (splitState) return splitState;
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeStateFile(state) {
  const persistedState = persistImageAssets(state);
  writeJsonFile(settingsPath, pickSettings(persistedState));
  persistedState.providers = Array.isArray(persistedState.providers) ? persistedState.providers.map(sanitizePublicProvider) : [];
  writeJsonFile(providersPath, persistedState.providers);
  writeJsonFile(tagsPath, pickTags(persistedState));
  writeJsonFile(itemsPath, Array.isArray(persistedState.items) ? persistedState.items : []);
  writeJsonFile(videoItemsPath, Array.isArray(persistedState.videoItems) ? persistedState.videoItems : []);
  pruneUploadsOutside(unionUploadNames(persistedState.items || [], persistedState.videoItems || []));
  return persistedState;
}

function readSplitState() {
  const hasSplitFiles = [settingsPath, providersPath, tagsPath, itemsPath, videoItemsPath].some((filePath) => fs.existsSync(filePath));
  if (!hasSplitFiles) return null;
  return {
    ...readSettings(),
    ...readTags(),
    providers: readProviders(),
    items: readItems(),
    videoItems: readVideoItems(),
  };
}

function readSettings() {
  return readJsonFile(settingsPath, () => pickSettings(readLegacyState() || {}));
}

function readProviders() {
  const providers = readJsonFile(providersPath, () => {
    const legacy = readLegacyState();
    return Array.isArray(legacy?.providers) ? legacy.providers : [];
  });
  const secrets = readProviderSecrets();
  return Array.isArray(providers) ? providers.map((provider) => {
    const publicProvider = sanitizePublicProvider(provider);
    const name = normalizeProviderName(publicProvider.name);
    const secret = secrets[name] || secrets[provider.name] || "";
    return {
      ...publicProvider,
      name,
      hasServerKey: providerHasSecret(name, secret),
      keyCount: name === "Google Gemini API" ? geminiApiKeysFromSecret(secret).length : provider.keyCount,
      currentKeyIndex: name === "Google Gemini API" ? Number(secret?.currentKeyIndex || 0) : provider.currentKeyIndex,
    };
  }) : [];
}

function readProviderSecrets() {
  const secrets = readJsonFile(providerSecretsPath, () => ({}));
  if (Object.prototype.hasOwnProperty.call(secrets, "Google Gemini")) {
    if (!Object.prototype.hasOwnProperty.call(secrets, "Google Gemini API")) secrets["Google Gemini API"] = secrets["Google Gemini"];
    delete secrets["Google Gemini"];
  }
  return secrets;
}

function readTags() {
  return readJsonFile(tagsPath, () => pickTags(readLegacyState() || {}));
}

function readItems() {
  return readJsonFile(itemsPath, () => {
    const legacy = readLegacyState();
    return Array.isArray(legacy?.items) ? legacy.items : [];
  });
}

function readVideoItems() {
  return readJsonFile(videoItemsPath, () => {
    const legacy = readLegacyState();
    return Array.isArray(legacy?.videoItems) ? legacy.videoItems : [];
  });
}

function selectProvider(providerName, purpose) {
  const secrets = readProviderSecrets();
  const wantedName = providerName ? normalizeProviderName(providerName) : "";
  const providers = readProviders()
    .filter((provider) => provider && (purpose === "any" || provider[purpose]) && (provider.enabled !== false || provider[purpose]))
    .filter((provider) => wantedName ? provider.name === wantedName : true)
    .map((provider) => ({ ...provider, secret: secrets[provider.name] || secrets[provider.name === "Google Gemini API" ? "Google Gemini" : provider.name] || "" }))
    .filter((provider) => providerHasSecret(provider.name, provider.secret))
    .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99));
  return providers[0] || null;
}

async function callProvider(provider, request) {
  if (provider.name === "Google Gemini API") {
    return callGeminiApiProvider(provider, request);
  }
  if (provider.name === "Google Vertex AI") {
    return callVertexProvider(provider, request);
  }
  return callOpenAiCompatibleProvider(provider, request);
}

function normalizeProviderName(name) {
  return name === "Google Gemini" ? "Google Gemini API" : name;
}

async function syncPromptWildcards(res, mode) {
  if (!["incremental", "rebuild"].includes(mode)) {
    return sendJson(res, 400, {
      ok: false,
      error: "invalid_wildcard_sync_mode",
      message: "와일드카드 갱신 방식이 올바르지 않습니다.",
    });
  }

  if (wildcardSyncInProgress) {
    return sendJson(res, 409, {
      ok: false,
      error: "wildcard_sync_in_progress",
      message: "다른 와일드카드 갱신이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  wildcardSyncInProgress = true;
  try {
    const operation = mode === "rebuild" ? rebuildWildcards : syncWildcards;
    const result = await operation({
      itemsPath,
      settingsPath,
      statePath: wildcardSyncStatePath,
      wildcardDir,
      refreshUrl: impactWildcardRefreshUrl,
    });
    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error("Wildcard sync failed:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "wildcard_sync_failed",
      message: error?.message || "와일드카드 업데이트에 실패했습니다.",
    });
  } finally {
    wildcardSyncInProgress = false;
  }
}

function providerCredentialTarget(provider) {
  const name = normalizeProviderName(provider?.name);
  if (name === "Google Gemini API") return "https://generativelanguage.googleapis.com";
  if (name === "Google Vertex AI") {
    const location = String(provider?.location || "us-central1").trim().toLowerCase();
    if (!/^(global|[a-z]+-[a-z0-9]+[0-9])$/.test(location)) throw new Error("Vertex Location 형식이 올바르지 않습니다.");
    return location === "global" ? "https://aiplatform.googleapis.com" : `https://${location}-aiplatform.googleapis.com`;
  }
  const rawUrl = String(provider?.apiUrl || defaultOpenAiCompatibleEndpoint(name)).trim();
  const parsed = new URL(rawUrl);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname.toLowerCase());
  if (parsed.username || parsed.password || (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))) {
    throw new Error(`${name || "API"} URL은 HTTPS 또는 로컬 주소만 사용할 수 있습니다.`);
  }
  return parsed.origin;
}

function providerHasSecret(name, secret) {
  if (name === "Google Gemini API") return geminiApiKeysFromSecret(secret).length > 0;
  if (name === "Google Vertex AI") return Boolean(vertexJsonFromSecret(secret));
  return Boolean(apiKeyFromSecret(secret));
}

function apiKeyFromSecret(secret) {
  if (typeof secret === "string") return secret;
  return typeof secret?.apiKey === "string" ? secret.apiKey : "";
}

function vertexJsonFromSecret(secret) {
  if (typeof secret === "string") return secret.trim().startsWith("{") ? secret : "";
  return typeof secret?.vertexJson === "string" ? secret.vertexJson : "";
}

function geminiApiKeysFromSecret(secret) {
  if (Array.isArray(secret?.apiKeys)) return secret.apiKeys.map((key) => String(key || "").trim()).filter(Boolean).slice(0, 3);
  if (typeof secret === "string" && secret.trim() && !secret.trim().startsWith("{")) return [secret.trim()];
  if (typeof secret?.apiKey === "string" && secret.apiKey.trim()) return [secret.apiKey.trim()];
  return [];
}

function resolveProviderModel(provider, request = {}) {
  const purposeModel = request.image ? provider.visionModel : provider.textModel;
  return String(purposeModel || provider.model || provider.visionModel || provider.textModel || "").trim();
}

async function callOpenAiCompatibleProvider(provider, request) {
  const model = resolveProviderModel(provider, request);
  if (!model) throw new Error(`${provider.name} 모델명이 비어 있습니다.`);

  if (shouldUseOpenAiResponsesApi(provider, model)) {
    return callOpenAiResponsesProvider(provider, request, model);
  }

  return callOpenAiChatCompletionsProvider(provider, request, model);
}

async function callOpenAiChatCompletionsProvider(provider, request, model) {
  const endpoint = normalizeOpenAiCompatibleEndpoint(provider.apiUrl || defaultOpenAiCompatibleEndpoint(provider.name));
  const content = [{ type: "text", text: request.prompt }];
  if (request.image) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${request.image.mimeType};base64,${request.image.data}` },
    });
  }
  const payload = {
    model,
    messages: [
      { role: "system", content: "Return strict JSON only. No markdown." },
      { role: "user", content },
    ],
    temperature: 1,
  };
  const maxTokens = Number(provider.maxOutputTokens || provider.maxTokens || 0);
  if (maxTokens > 0) payload.max_tokens = maxTokens;
  if (provider.responseFormatJson === true) payload.response_format = { type: "json_object" };

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKeyFromSecret(provider.secret)}`,
    },
    body: JSON.stringify(payload),
  }, request.timeoutSeconds);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `${provider.name} API 오류 ${response.status}`);
  return json.choices?.[0]?.message?.content || "";
}

async function callOpenAiResponsesProvider(provider, request, model) {
  const endpoint = normalizeOpenAiResponsesEndpoint(provider.apiUrl || defaultOpenAiCompatibleEndpoint(provider.name));
  const content = [{ type: "input_text", text: request.prompt }];
  if (request.image) {
    content.push({
      type: "input_image",
      image_url: `data:${request.image.mimeType};base64,${request.image.data}`,
      detail: provider.imageDetail || "high",
    });
  }

  const payload = {
    model,
    instructions: "Return strict JSON only. No markdown.",
    input: [
      { role: "user", content },
    ],
    text: { format: { type: "json_object" } },
    truncation: "auto",
  };
  const maxOutputTokens = Number(provider.maxOutputTokens || provider.maxTokens || 6000);
  if (maxOutputTokens > 0) payload.max_output_tokens = maxOutputTokens;

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKeyFromSecret(provider.secret)}`,
    },
    body: JSON.stringify(payload),
  }, request.timeoutSeconds);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `${provider.name} Responses API 오류 ${response.status}`);
  const text = extractOpenAiResponsesText(json);
  if (!text) throw new Error(`${provider.name} Responses API 응답에 output_text가 없습니다.`);
  return text;
}

function defaultOpenAiCompatibleEndpoint(name) {
  if (name === "xAI Grok") return "https://api.x.ai/v1/chat/completions";
  if (name === "Cerebras Cloud") return "https://api.cerebras.ai/v1/chat/completions";
  return "https://api.openai.com/v1/chat/completions";
}

function normalizeOpenAiCompatibleEndpoint(value) {
  const endpoint = String(value || "").trim().replace(/\/+$/, "");
  if (!endpoint) return "";
  if (endpoint.endsWith("/chat/completions")) return endpoint;
  if (endpoint.endsWith("/responses")) return endpoint.replace(/\/responses$/, "/chat/completions");
  return `${endpoint}/chat/completions`;
}

function normalizeOpenAiResponsesEndpoint(value) {
  const endpoint = String(value || "").trim().replace(/\/+$/, "");
  if (!endpoint) return "https://api.openai.com/v1/responses";
  if (endpoint.endsWith("/responses")) return endpoint;
  if (endpoint.endsWith("/chat/completions")) return endpoint.replace(/\/chat\/completions$/, "/responses");
  return `${endpoint}/responses`;
}

function shouldUseOpenAiResponsesApi(provider, _model) {
  if (provider.forceChatCompletions === true) return false;
  if (provider.forceResponsesApi === true) return true;
  const endpoint = String(provider.apiUrl || defaultOpenAiCompatibleEndpoint(provider.name) || "").toLowerCase();
  return endpoint.includes("api.openai.com");
}

function extractOpenAiResponsesText(json) {
  if (typeof json?.output_text === "string" && json.output_text.trim()) return json.output_text;
  const parts = [];
  for (const item of Array.isArray(json?.output) ? json.output : []) {
    if (typeof item?.text === "string") parts.push(item.text);
    if (typeof item?.output_text === "string") parts.push(item.output_text);
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

function normalizeGeminiModelName(_providerName, model, fallback) {
  return String(model || fallback || "").trim();
}

function normalizeVertexLocation(provider, serviceAccount, model) {
  const location = String(provider.location || serviceAccount.location || serviceAccount.region || "us-central1").trim();
  if (model === "gemini-3.5-flash" && location === "us-central1") {
    return "global";
  }
  return location;
}

async function callGeminiApiProvider(provider, request) {
  const keys = geminiApiKeysFromSecret(provider.secret);
  if (!keys.length) throw new Error("Gemini API Key가 설정되지 않았습니다.");
  const model = normalizeGeminiModelName(provider.name, resolveProviderModel(provider, request), "gemini-2.5-flash");
  const secret = typeof provider.secret === "object" && provider.secret ? provider.secret : {};
  let currentIndex = Math.max(0, Math.min(Number(secret.currentKeyIndex || 0), keys.length - 1));
  let lastError = new Error("Gemini API 요청에 실패했습니다.");
  const parts = [{ text: request.prompt }];
  if (request.image) {
    parts.push({ inline_data: { mime_type: request.image.mimeType, data: request.image.data } });
  }
  for (let keyTry = 0; keyTry < keys.length; keyTry++) {
    const keyIndex = currentIndex % keys.length;
    const apiKey = keys[keyIndex];
    for (let attempt = 1; attempt <= Math.max(1, Number(provider.maxRetries || 2)); attempt++) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      }, request.timeoutSeconds);
      const text = await response.text();
      if (response.ok) {
        updateGeminiKeyIndex(provider.name, keyIndex);
        const json = JSON.parse(text || "{}");
        return (json.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n");
      }
      lastError = new Error(`Gemini API Key #${keyIndex + 1} 실패 (${response.status}): ${text.slice(0, 300)}`);
      if (response.status === 429) {
        await delay(Math.pow(2, attempt) * 500);
        continue;
      }
      if ([400, 401, 403, 500, 502, 503, 504].includes(response.status)) break;
    }
    currentIndex = (currentIndex + 1) % keys.length;
  }
  updateGeminiKeyIndex(provider.name, currentIndex);
  throw lastError;
}

async function callVertexProvider(provider, request) {
  const serviceAccount = parseVertexSecret(vertexJsonFromSecret(provider.secret));
  const accessToken = await getVertexAccessToken(serviceAccount, request.timeoutSeconds);
  const model = normalizeGeminiModelName(provider.name, resolveProviderModel(provider, request), "gemini-2.5-flash");
  const location = normalizeVertexLocation(provider, serviceAccount, model);
  const vertexHost = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const endpoint = `https://${vertexHost}/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const parts = [{ text: request.prompt }];
  if (request.image) {
    parts.push({ inlineData: { mimeType: request.image.mimeType, data: request.image.data } });
  }
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  }, request.timeoutSeconds);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `Vertex AI API 오류 ${response.status}`);
  return (json.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n");
}

function updateGeminiKeyIndex(providerName, keyIndex) {
  const secrets = readProviderSecrets();
  const name = normalizeProviderName(providerName);
  const secret = typeof secrets[name] === "object" && secrets[name] ? secrets[name] : { apiKeys: geminiApiKeysFromSecret(secrets[name]) };
  secret.currentKeyIndex = keyIndex;
  secrets[name] = secret;
  writeJsonFile(providerSecretsPath, secrets);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseVertexSecret(secret) {
  let parsed;
  try {
    parsed = JSON.parse(secret);
  } catch (error) {
    throw new Error("Vertex JSON Key 형식이 올바르지 않습니다.");
  }
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error("Vertex JSON Key에 client_email, private_key, project_id가 필요합니다.");
  }
  return parsed;
}

async function getVertexAccessToken(serviceAccount, timeoutSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    alg: "RS256",
    typ: "JWT",
  }, {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }, serviceAccount.private_key);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, timeoutSeconds);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error_description || json.error || `Google OAuth 오류 ${response.status}`);
  return json.access_token;
}

function signJwt(header, payload, privateKey) {
  const input = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(privateKey, "base64url")}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function fetchWithTimeout(url, options, timeoutSeconds = 60) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5, Number(timeoutSeconds) || 60) * 1000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function readRequestImage(item) {
  const source = item.analysisImage?.dataUrl || item.imageUrl || "";
  if (!source) return null;
  if (source.startsWith("data:")) return parseDataUrlImage(source);
  if (source.startsWith("/uploads/")) {
    const filePath = path.join(rootDir, source);
    ensureInside(uploadsDir, filePath);
    const buffer = fs.readFileSync(filePath);
    return { mimeType: mimeTypes[path.extname(filePath).toLowerCase()]?.split(";")[0] || "image/webp", data: buffer.toString("base64") };
  }
  return null;
}

function parseDataUrlImage(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+)(;charset=[^;,]+)?;base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[3] };
}

function parseProviderJson(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("API 응답에서 JSON을 찾지 못했습니다.");
    return JSON.parse(match[0]);
  }
}

function normalizeProviderResult(result) {
  const promptSections = result.promptSections || result.promptJson || {};
  const detectedElements = Array.isArray(result.detectedElements) ? result.detectedElements : [];
  const detectedButExcludedElements = Array.isArray(result.detectedButExcludedElements) ? result.detectedButExcludedElements : [];
  return {
    promptJson: Object.fromEntries(["appearance", "outfit", "background", "expression_pose", "details"].map((key) => {
      const section = promptSections[key] || {};
      const sentences = Array.isArray(section.sentences) ? section.sentences : Array.isArray(section) ? section : [];
      return [key, {
        title_ko: section.title_ko || "",
        sentences: sentences.map((sentence, index) => ({
          id: sentence.id || `${key}-${index + 1}`,
          en: String(sentence.en || "").trim(),
          ko: String(sentence.ko || "").trim(),
        })).filter((sentence) => sentence.en || sentence.ko),
      }];
    })),
    outfitTags: Array.isArray(result.outfitTags) ? result.outfitTags : [],
    backgroundTags: Array.isArray(result.backgroundTags) ? result.backgroundTags : [],
    generalTags: Array.isArray(result.generalTags) ? result.generalTags : [],
    titleSummary: typeof result.titleSummary === "string" ? result.titleSummary.trim() : "",
    detectedElements,
    detectedButExcludedElements,
  };
}

function normalizeSectionTranslations(result, sourceSentences) {
  const translations = Array.isArray(result.translations) ? result.translations : Array.isArray(result.sentences) ? result.sentences : [];
  const byId = new Map(translations.map((entry) => [String(entry.id || ""), String(entry.ko || entry.translation || "").trim()]));
  return sourceSentences.map((sentence) => ({
    id: sentence.id,
    ko: byId.get(sentence.id) || "",
  })).filter((sentence) => sentence.ko);
}

function readLegacyState() {
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function readJsonFile(filePath, fallbackFactory) {
  if (!fs.existsSync(filePath)) return fallbackFactory();
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }
}

function splitStateBytes() {
  return [settingsPath, providersPath, tagsPath, itemsPath, videoItemsPath].reduce((total, filePath) => {
    return total + (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
  }, 0);
}

function pickSettings(state) {
  return {
    theme: state.theme || "default-light",
    categories: Array.isArray(state.categories) ? state.categories : [],
    promptInstruction: state.promptInstruction || "",
    promptSettings: state.promptSettings || {},
    uploadSettings: state.uploadSettings || {},
    albumSettings: state.albumSettings || {},
    copyDisplaySettings: state.copyDisplaySettings || {},
    categorySettings: state.categorySettings || {},
    wildcardSettings: normalizeWildcardSettings(state.wildcardSettings),
    themeSettings: state.themeSettings || {},
    advancedSettings: state.advancedSettings || {},
    videoCategories: Array.isArray(state.videoCategories) ? state.videoCategories : [],
    videoSettings: state.videoSettings && typeof state.videoSettings === "object" ? state.videoSettings : {},
  };
}

function pickTags(state) {
  return {
    excludeOptions: Array.isArray(state.excludeOptions) ? state.excludeOptions : [],
    outfitTagOptions: Array.isArray(state.outfitTagOptions) ? state.outfitTagOptions : [],
    backgroundTagOptions: Array.isArray(state.backgroundTagOptions) ? state.backgroundTagOptions : [],
  };
}

function persistImageAssets(state) {
  const copy = structuredCloneCompat(state);
  if (!Array.isArray(copy.items)) copy.items = [];
  if (!Array.isArray(copy.videoItems)) copy.videoItems = [];
  copy.items = copy.items.map((item) => persistItemImages(item));
  copy.videoItems = copy.videoItems.map((item) => persistItemImages(item));
  return copy;
}

function persistItemImages(item) {
  const next = { ...item };
  const roles = [
    ["displayImage", "display"],
    ["thumbnailImage", "thumbnail"],
    ["analysisImage", "analysis"],
    ["originalImage", "original"],
  ];
  for (const [field, role] of roles) {
    if (next[field]?.dataUrl?.startsWith("data:")) {
      const stored = storeDataUrl(next[field].dataUrl, next.id || "image", role);
      next[field] = { ...next[field], dataUrl: stored.url, type: stored.mime, size: stored.size, width: next[field].width || 0, height: next[field].height || 0 };
    }
  }
  if (typeof next.imageUrl === "string" && next.imageUrl.startsWith("data:")) {
    const stored = storeDataUrl(next.imageUrl, next.id || "image", "image");
    next.imageUrl = stored.url;
  }
  if (typeof next.thumbnailUrl === "string" && next.thumbnailUrl.startsWith("data:")) {
    const stored = storeDataUrl(next.thumbnailUrl, next.id || "image", "thumb");
    next.thumbnailUrl = stored.url;
  }
  if (next.displayImage?.dataUrl) next.imageUrl = next.displayImage.dataUrl;
  if (next.thumbnailImage?.dataUrl) next.thumbnailUrl = next.thumbnailImage.dataUrl;
  return next;
}

function storeDataUrl(dataUrl, id, role) {
  const match = dataUrl.match(/^data:([^;,]+)(;charset=[^;,]+)?;base64,(.+)$/);
  if (!match) {
    const svgMatch = dataUrl.match(/^data:image\/svg\+xml;charset=UTF-8,(.+)$/);
    if (!svgMatch) throw new Error("Unsupported data URL");
    const buffer = Buffer.from(decodeURIComponent(svgMatch[1]), "utf8");
    return writeAsset(buffer, "image/svg+xml", id, role, ".svg");
  }
  const mime = match[1];
  const ext = extensionForMime(mime);
  const buffer = Buffer.from(match[3], "base64");
  return writeAsset(buffer, mime, id, role, ext);
}

function writeAsset(buffer, mime, id, role, ext) {
  if (![".webp", ".jpg", ".jpeg", ".png", ".svg"].includes(ext)) throw new Error("Unsupported image extension");
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 12);
  const fileName = `${safeId}-${role}-${hash}${ext === ".jpeg" ? ".jpg" : ext}`;
  const filePath = path.join(uploadsDir, fileName);
  ensureInside(uploadsDir, filePath);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer);
  return { url: `/uploads/${fileName}`, mime, size: buffer.length };
}

function extensionForMime(mime) {
  if (mime === "image/webp") return ".webp";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/svg+xml") return ".svg";
  throw new Error(`Unsupported image MIME: ${mime}`);
}

function serveStatic(req, res, pathname) {
  let normalized;
  try {
    normalized = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  } catch (_error) {
    return sendText(res, 400, "Bad request");
  }

  let filePath = publicFiles.get(normalized);
  if (!filePath && normalized.startsWith("/uploads/")) {
    let name;
    try {
      name = safeUploadFileName(normalized.slice("/uploads/".length));
    } catch (_error) {
      return sendText(res, 404, "Not found");
    }
    filePath = path.join(uploadsDir, name);
    ensureInside(uploadsDir, filePath);
  }
  if (!filePath) return sendText(res, 404, "Not found");
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendText(res, 404, "Not found");
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") {
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": normalized.startsWith("/uploads/") ? "public, max-age=31536000, immutable" : "no-store",
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function applySecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function requestOriginAllowed(req) {
  if (!allowRemote && !isLoopbackAddress(req.socket.remoteAddress)) return false;
  if (allowRemote) return true;
  const allowedAuthorities = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  const authority = String(req.headers.host || "").toLowerCase();
  if (!allowedAuthorities.has(authority)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && allowedAuthorities.has(parsed.host.toLowerCase());
  } catch (_error) {
    return false;
  }
}

function isLoopbackHost(value) {
  const hostName = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return hostName === "localhost" || hostName === "127.0.0.1" || hostName === "::1";
}

function isLoopbackAddress(value) {
  const address = String(value || "").trim().toLowerCase().replace(/^::ffff:/, "");
  return address === "::1" || address === "127.0.0.1";
}

function sanitizePublicProvider(provider) {
  const source = provider && typeof provider === "object" ? provider : {};
  const allowed = [
    "name", "enabled", "model", "visionModel", "textModel", "hasServerKey", "keyCount", "currentKeyIndex",
    "apiUrl", "location", "priority", "fallbackEnabled", "timeoutSeconds", "maxRetries",
    "useForImageAnalysis", "useForTranslation", "useForPromptCleanup", "useForTagging", "lastTestStatus",
    "forceChatCompletions", "forceResponsesApi", "imageDetail", "maxOutputTokens", "maxTokens", "responseFormatJson",
  ];
  const next = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) next[key] = source[key];
  }
  return next;
}

function sanitizeProviderList(providers, secrets, options = {}) {
  const seen = new Set();
  const previousByName = new Map((options.previousProviders || []).map((provider) => [normalizeProviderName(provider?.name), provider]));
  let secretsChanged = false;
  const publicProviders = (Array.isArray(providers) ? providers : []).slice(0, 20).map((provider) => {
    const next = sanitizePublicProvider(provider);
    const name = normalizeProviderName(next.name);
    if (!name || seen.has(name)) throw new Error("공급자 이름이 비어 있거나 중복되었습니다.");
    seen.add(name);
    next.name = name;
    const target = providerCredentialTarget(next);
    const previous = previousByName.get(name);
    if (options.clearChangedSecrets && previous) {
      const previousTarget = providerCredentialTarget(previous);
      if (target !== previousTarget && Object.prototype.hasOwnProperty.call(secrets, name)) {
        delete secrets[name];
        secretsChanged = true;
      }
    }
    const secret = secrets[name];
    next.hasServerKey = providerHasSecret(name, secret);
    if (name === "Google Gemini API") {
      next.keyCount = geminiApiKeysFromSecret(secret).length;
      next.currentKeyIndex = Number(secret?.currentKeyIndex || 0);
    } else {
      delete next.keyCount;
      delete next.currentKeyIndex;
    }
    return next;
  });
  return { providers: publicProviders, secretsChanged };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxRequestBytes) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readBinaryBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxRequestBytes) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

function ensureInside(parent, target) {
  const relative = path.relative(parent, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid path");
}

function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value));
}
