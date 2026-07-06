const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(rootDir, "uploads");
const statePath = path.join(dataDir, "state.json");
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
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "internal_server_error", message: error.message });
  }
});

server.listen(port, () => {
  console.log(`Prompt Archive server running at http://127.0.0.1:${port}`);
  console.log(`Data: ${dataDir}`);
  console.log(`Uploads: ${uploadsDir}`);
});

function sendState(res) {
  if (!fs.existsSync(statePath)) return sendJson(res, 200, { state: null });
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  return sendJson(res, 200, { state });
}

async function saveState(req, res) {
  const body = await readBody(req);
  const payload = JSON.parse(body || "{}");
  if (!payload.state || typeof payload.state !== "object") {
    return sendJson(res, 400, { error: "invalid_state" });
  }
  const state = persistImageAssets(payload.state);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  return sendJson(res, 200, { ok: true, state });
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
