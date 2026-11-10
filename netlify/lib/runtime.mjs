// Shared plumbing for the site's functions: settings, storage, auth, responses.
import { timingSafeEqual, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";

export function env(name) {
  return globalThis.Netlify?.env?.get(name) ?? process.env[name];
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export const errorResponse = (message, status = 400) => json({ error: message }, status);

// ---------- Storage ----------
// On Netlify: Netlify Blobs. Locally (npm run dev): a folder on disk.
class FileStore {
  constructor(dir) { this.dir = dir; }
  file(key) { return path.join(this.dir, key.replace(/[^a-zA-Z0-9._-]/g, "_")); }
  async get(key, { type } = {}) {
    try {
      const buf = await readFile(this.file(key));
      if (type === "json") return JSON.parse(buf.toString("utf8"));
      if (type === "arrayBuffer") return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return buf.toString("utf8");
    } catch (e) { if (e.code === "ENOENT") return null; throw e; }
  }
  async etagOf(key) {
    try { return createHash("sha256").update(await readFile(this.file(key))).digest("hex").slice(0, 16); }
    catch (e) { if (e.code === "ENOENT") return null; throw e; }
  }
  // Reads the value and its etag from one read, so they always match.
  async getWithMetadata(key, { type } = {}) {
    let buf;
    try { buf = await readFile(this.file(key)); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
    const data = type === "json" ? JSON.parse(buf.toString("utf8"))
      : type === "arrayBuffer" ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      : buf.toString("utf8");
    let metadata = {};
    try { metadata = JSON.parse(await readFile(this.file(key) + ".meta", "utf8")); } catch {}
    return { data, metadata, etag: createHash("sha256").update(buf).digest("hex").slice(0, 16) };
  }
  // Same rules as Netlify Blobs: onlyIfNew / onlyIfMatch writes return { modified: false } when they lose.
  async set(key, value, { metadata, onlyIfNew, onlyIfMatch } = {}) {
    const prev = (FileStore.locks.get(this.file(key)) || Promise.resolve());
    let release;
    const mine = new Promise((r) => (release = r));
    FileStore.locks.set(this.file(key), prev.then(() => mine));
    await prev;
    try {
      const current = await this.etagOf(key);
      if (onlyIfNew && current !== null) return { modified: false };
      if (onlyIfMatch !== undefined && current !== onlyIfMatch) return { modified: false };
      await mkdir(this.dir, { recursive: true });
      const buf = value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.isBuffer(value) ? value : Buffer.from(String(value));
      const tmp = this.file(key) + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2);
      await writeFile(tmp, buf);
      await rename(tmp, this.file(key)); // atomic, so readers never see half a file
      if (metadata) await writeFile(this.file(key) + ".meta", JSON.stringify(metadata));
      return { modified: true, etag: await this.etagOf(key) };
    } finally { release(); }
  }
  async setJSON(key, value, opts) { return this.set(key, JSON.stringify(value), opts); }
  async delete(key) { await rm(this.file(key), { force: true }); await rm(this.file(key) + ".meta", { force: true }); }
  static locks = new Map();
}

let blobsModule;
export async function store(name) {
  const localDir = env("GIFTGUIDE_LOCAL_STORE");
  if (localDir) return new FileStore(path.join(localDir, name));
  blobsModule ??= await import("@netlify/blobs");
  return blobsModule.getStore({ name, consistency: "strong" });
}

// ---------- Cache ----------
export const ITEMS_CACHE_TAG = "gift-items";
export async function purgeItemsCache() {
  if (env("GIFTGUIDE_LOCAL_STORE")) return;
  try {
    const { purgeCache } = await import("@netlify/cache");
    await purgeCache({ tags: [ITEMS_CACHE_TAG] });
  } catch (e) {
    console.warn("Cache purge failed; the public page will update within 5 minutes.", e?.message);
  }
}

// ---------- Auth ----------
// Editors send the admin password as a Bearer token. Set ADMIN_PASSWORD in Netlify's environment variables.
export async function requireEditor(req) {
  const expected = env("ADMIN_PASSWORD");
  if (!expected || expected.length < 8) return errorResponse("The site has no admin password yet. Set ADMIN_PASSWORD (8+ characters) in Netlify and redeploy.", 503);
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!given || !timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return errorResponse("Wrong password.", 401);
  }
  return null;
}

// ---------- Fetching other sites ----------
export const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "accept-language": "en-GB,en;q=0.9",
};

export function checkPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (env("GIFTGUIDE_ALLOW_LOCAL") === "1") return u; // local testing only
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.startsWith("[")) return null;
  return u;
}

export async function fetchLimited(url, { accept, maxBytes, timeoutMs = 12000, referer } = {}) {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, accept: accept || "*/*", ...(referer ? { referer } : {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const reader = res.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw Object.assign(new Error("too large"), { code: "too_large" }); }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { res, body, finalUrl: res.url || String(url) };
}
