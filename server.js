const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(rootDir, "uploads");
const statePath = path.join(dataDir, "state.json");
const settingsPath = path.join(dataDir, "settings.json");
const providersPath = path.join(dataDir, "providers.json");
const providerSecretsPath = path.join(dataDir, "provider-secrets.json");
const tagsPath = path.join(dataDir, "tags.json");
const itemsPath = path.join(dataDir, "items.json");
const port = Number(process.env.PORT || 5173);
const maxRequestBytes = Number(process.env.MAX_REQUEST_MB || 150) * 1024 * 1024;

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
    if (url.pathname === "/api/state" && req.method === "GET") return sendState(res);
    if (url.pathname === "/api/state" && req.method === "PUT") return saveState(req, res);
    if (url.pathname === "/api/settings" && req.method === "GET") return sendSettings(res);
    if (url.pathname === "/api/settings" && req.method === "PUT") return saveSettings(req, res);
    if (url.pathname === "/api/providers" && req.method === "GET") return sendProviders(res);
    if (url.pathname === "/api/providers" && req.method === "PUT") return saveProviders(req, res);
    if (url.pathname === "/api/providers/test" && req.method === "POST") return testProvider(req, res);
    if (url.pathname === "/api/analyze" && req.method === "POST") return analyzeImage(req, res);
    if (url.pathname === "/api/tags" && req.method === "GET") return sendTags(res);
    if (url.pathname === "/api/tags" && req.method === "PUT") return saveTags(req, res);
    if (url.pathname === "/api/items" && req.method === "GET") return sendItems(res);
    if (url.pathname === "/api/items" && req.method === "PUT") return saveItems(req, res);
    const itemMatch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemMatch && req.method === "PUT") return saveItem(itemMatch[1], req, res);
    if (itemMatch && req.method === "DELETE") return deleteItem(itemMatch[1], res);
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "internal_server_error", message: error.message });
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

server.listen(port, () => {
  console.log(`Prompt Archive server running at http://127.0.0.1:${port}`);
  console.log(`Data: ${dataDir}`);
  console.log(`Uploads: ${uploadsDir}`);
});

function sendState(res) {
  const state = readStateFile();
  if (!state) return sendJson(res, 200, { state: null });
  return sendJson(res, 200, { state });
}

async function saveState(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.state || typeof payload.state !== "object") {
    return sendJson(res, 400, { error: "invalid_state" });
  }
  const state = writeStateFile(payload.state);
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
  writeJsonFile(settingsPath, payload.settings);
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
  const providers = payload.providers.map((provider) => {
    const pendingKey = typeof provider._pendingKey === "string" ? provider._pendingKey.trim() : "";
    const pendingKeys = Array.isArray(provider._pendingKeys) ? provider._pendingKeys.map((key) => String(key || "").trim()).filter(Boolean).slice(0, 3) : [];
    const secretName = normalizeProviderName(provider.name);
    if (provider.name === "Google Gemini API" && pendingKeys.length) {
      secrets[secretName] = { ...(typeof secrets[secretName] === "object" ? secrets[secretName] : {}), apiKeys: pendingKeys, currentKeyIndex: 0 };
    } else if (provider.name === "Google Vertex AI" && pendingKey) {
      secrets[secretName] = { ...(typeof secrets[secretName] === "object" ? secrets[secretName] : {}), vertexJson: pendingKey };
    } else if (pendingKey) {
      secrets[secretName] = { ...(typeof secrets[secretName] === "object" ? secrets[secretName] : {}), apiKey: pendingKey };
    }
    const { _pendingKey, _pendingKeys, ...publicProvider } = provider;
    const secret = secrets[secretName];
    publicProvider.name = secretName;
    publicProvider.keyCount = provider.name === "Google Gemini API" ? geminiApiKeysFromSecret(secret).length : undefined;
    publicProvider.currentKeyIndex = provider.name === "Google Gemini API" ? Number(secret?.currentKeyIndex || 0) : undefined;
    publicProvider.hasServerKey = providerHasSecret(publicProvider.name, secret) || Boolean(publicProvider.hasServerKey);
    return publicProvider;
  });
  writeJsonFile(providerSecretsPath, secrets);
  writeJsonFile(providersPath, providers);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    providerCount: providers.length,
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
  try {
    const text = await callProvider(provider, {
      prompt: payload.request || "",
      image: readRequestImage(payload.item || {}),
      timeoutSeconds: provider.timeoutSeconds || 60,
    });
    const parsed = parseProviderJson(text);
    const normalized = normalizeProviderResult(parsed);
    return sendJson(res, 200, { ok: true, provider: provider.name, ...normalized });
  } catch (error) {
    return sendJson(res, 502, { error: "analysis_failed", message: error.message, provider: provider.name });
  }
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
  const items = payload.items.map((item) => persistItemImages(item));
  writeJsonFile(itemsPath, items);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    itemCount: items.length,
    bytes: fs.statSync(itemsPath).size,
  });
}

async function saveItem(id, req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.item || typeof payload.item !== "object") {
    return sendJson(res, 400, { error: "invalid_item" });
  }
  const items = readItems();
  const item = persistItemImages({ ...payload.item, id: payload.item.id || id });
  const index = items.findIndex((entry) => entry.id === id);
  if (index >= 0) items[index] = item;
  else items.unshift(item);
  writeJsonFile(itemsPath, items);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    id: item.id,
  });
}

function deleteItem(id, res) {
  const items = readItems().filter((item) => item.id !== id);
  writeJsonFile(itemsPath, items);
  return sendJson(res, 200, {
    ok: true,
    updatedAt: Date.now(),
    id,
    itemCount: items.length,
  });
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
  writeJsonFile(providersPath, Array.isArray(persistedState.providers) ? persistedState.providers : []);
  writeJsonFile(tagsPath, pickTags(persistedState));
  writeJsonFile(itemsPath, Array.isArray(persistedState.items) ? persistedState.items : []);
  return persistedState;
}

function readSplitState() {
  const hasSplitFiles = [settingsPath, providersPath, tagsPath, itemsPath].some((filePath) => fs.existsSync(filePath));
  if (!hasSplitFiles) return null;
  return {
    ...readSettings(),
    ...readTags(),
    providers: readProviders(),
    items: readItems(),
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
    const name = normalizeProviderName(provider.name);
    const secret = secrets[name] || secrets[provider.name] || "";
    return {
      ...provider,
      name,
      hasServerKey: providerHasSecret(name, secret),
      keyCount: name === "Google Gemini API" ? geminiApiKeysFromSecret(secret).length : provider.keyCount,
      currentKeyIndex: name === "Google Gemini API" ? Number(secret?.currentKeyIndex || 0) : provider.currentKeyIndex,
    };
  }) : [];
}

function readProviderSecrets() {
  return readJsonFile(providerSecretsPath, () => ({}));
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

async function callOpenAiCompatibleProvider(provider, request) {
  const endpoint = normalizeOpenAiCompatibleEndpoint(provider.apiUrl || defaultOpenAiCompatibleEndpoint(provider.name));
  const model = provider.visionModel || provider.model || provider.textModel;
  if (!model) throw new Error(`${provider.name} 모델명이 비어 있습니다.`);
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
    temperature: 0.2,
  };
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

function defaultOpenAiCompatibleEndpoint(name) {
  if (name === "xAI Grok") return "https://api.x.ai/v1/chat/completions";
  if (name === "Cerebras Cloud") return "https://api.cerebras.ai/v1/chat/completions";
  return "https://api.openai.com/v1/chat/completions";
}

function normalizeOpenAiCompatibleEndpoint(value) {
  const endpoint = String(value || "").trim().replace(/\/+$/, "");
  if (!endpoint) return "";
  if (endpoint.endsWith("/chat/completions")) return endpoint;
  return `${endpoint}/chat/completions`;
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
  const model = normalizeGeminiModelName(provider.name, provider.visionModel || provider.model || provider.textModel, "gemini-2.5-flash");
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
  const model = normalizeGeminiModelName(provider.name, provider.visionModel || provider.model || provider.textModel, "gemini-2.5-flash");
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
    detectedButExcludedElements: Array.isArray(result.detectedButExcludedElements) ? result.detectedButExcludedElements : [],
  };
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
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function splitStateBytes() {
  return [settingsPath, providersPath, tagsPath, itemsPath].reduce((total, filePath) => {
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
    themeSettings: state.themeSettings || {},
    advancedSettings: state.advancedSettings || {},
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
  copy.items = copy.items.map((item) => persistItemImages(item));
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
  const normalized = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.join(rootDir, normalized);
  ensureInside(rootDir, filePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendText(res, 404, "Not found");
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": normalized.startsWith("/uploads/") ? "public, max-age=31536000, immutable" : "no-store",
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
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
