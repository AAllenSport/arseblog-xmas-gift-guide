// Gift list storage, validation and image copying.
import { createHash, randomUUID } from "node:crypto";
import { SECTIONS } from "./parse-product.mjs";
import { store, checkPublicUrl, fetchLimited } from "./runtime.mjs";
import { SEED_ITEMS } from "./seed.mjs";

const KEY = "items";
const MAX_IMAGES = 6;
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

export async function loadItems() {
  const s = await store("guide");
  const items = await s.get(KEY, { type: "json" });
  if (items == null) {
    await s.setJSON(KEY, SEED_ITEMS);
    return structuredClone(SEED_ITEMS);
  }
  return Array.isArray(items) ? items : [];
}

export async function saveItems(items) {
  const s = await store("guide");
  await s.setJSON(KEY, items);
}

export function sortItems(items) {
  return [...items].sort((a, b) =>
    SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
    (a.order ?? 0) - (b.order ?? 0) ||
    String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function publicView(items) {
  return sortItems(items.filter((i) => i.status === "live"))
    .map(({ id, section, url, name, description, merchant, price, images }) => ({ id, section, url, name, description, merchant, price, images }));
}

const str = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Returns { item } or { error }. `partial` allows updates that omit fields.
export function cleanInput(input, { partial = false } = {}) {
  const out = {};
  const has = (k) => input && Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has("url")) {
    const u = checkPublicUrl(input?.url);
    if (!u) return { error: "The product link should be a full web address starting with https://" };
    out.url = u.href;
  }
  if (!partial || has("section")) {
    if (!SECTIONS.includes(input?.section)) return { error: "Choose one of the sections." };
    out.section = input.section;
  }
  if (!partial || has("name")) {
    out.name = str(input?.name, 160);
    if (!out.name) return { error: "Give the gift a name." };
  }
  for (const [k, max] of [["merchant", 60], ["price", 30]]) if (!partial || has(k)) out[k] = str(input?.[k], max);
  if (!partial || has("description")) out.description = String(input?.description ?? "").trim().slice(0, 600);
  if (!partial || has("status")) out.status = input?.status === "live" ? "live" : "draft";
  if (!partial || has("images")) {
    const imgs = Array.isArray(input?.images) ? input.images : [];
    out.images = imgs.map((x) => String(x || "").trim())
      .filter((x) => /^\/img\/[a-zA-Z0-9._-]+$/.test(x) || checkPublicUrl(x))
      .slice(0, MAX_IMAGES);
  }
  return { item: out };
}

export async function saveImageBytes(buffer, contentType) {
  const ext = IMAGE_TYPES[(contentType || "").split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error("Use a JPG, PNG, WebP, GIF or AVIF image.");
  const key = createHash("sha256").update(buffer).digest("hex").slice(0, 24) + "." + ext;
  const s = await store("images");
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await s.set(key, ab, { metadata: { contentType: Object.keys(IMAGE_TYPES).find((t) => IMAGE_TYPES[t] === ext) } });
  return "/img/" + key;
}

// Copy a merchant's image onto our own storage so the guide never shows a broken
// hotlink. If the merchant refuses, keep their address and report it.
export async function rehostImage(url, referer) {
  if (url.startsWith("/img/")) return { src: url };
  const u = checkPublicUrl(url);
  if (!u) return { src: null, warning: "Skipped an image with an invalid address." };
  try {
    const { res, body } = await fetchLimited(u, { accept: "image/avif,image/webp,image/*,*/*;q=0.8", maxBytes: 8 * 1024 * 1024, referer });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) throw new Error("not an image");
    return { src: await saveImageBytes(body, type) };
  } catch (e) {
    return { src: u.href, warning: `Couldn't copy an image from ${u.hostname} (${e.message}); linking to the merchant's copy instead.` };
  }
}

export async function rehostAll(images, productUrl) {
  let referer;
  try { referer = new URL(productUrl).origin + "/"; } catch {}
  const results = await Promise.all((images || []).map((src) => rehostImage(src, referer)));
  return {
    images: results.map((r) => r.src).filter(Boolean),
    warnings: results.map((r) => r.warning).filter(Boolean),
  };
}

export function newItem(fields, items) {
  const inSection = items.filter((i) => i.section === fields.section);
  const order = Math.max(0, ...inSection.map((i) => i.order ?? 0)) + 1;
  const now = new Date().toISOString();
  return { id: randomUUID(), ...fields, order, createdAt: now, updatedAt: now };
}
