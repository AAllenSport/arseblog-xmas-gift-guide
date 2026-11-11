// Reader gift suggestions: an inbox editors review before anything reaches the guide.
// Stored as one list; every change is a conditional write, so two readers sending
// at the same moment can't overwrite each other.
import { createHash, randomUUID } from "node:crypto";
import { store, env } from "./runtime.mjs";
import { nameFromUrl, hostOf } from "./parse-product.mjs";

const KEY = "inbox";
export const MAX_INBOX = 300;          // stop accepting if nobody's reviewed for a long while
export const MAX_PER_DAY = 10;         // per sender, see rateLimit()

async function update(storeName, key, change) {
  const s = await store(storeName);
  for (let attempt = 0; attempt < 10; attempt++) {
    const found = await s.getWithMetadata(key, { type: "json" });
    const { next, result } = change(found?.data ?? null);
    if (next === undefined) return result; // nothing to write
    const res = found
      ? await s.setJSON(key, next, { onlyIfMatch: found.etag })
      : await s.setJSON(key, next, { onlyIfNew: true });
    if (res?.modified !== false) return result;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("Busy, please try again in a moment.");
}

export async function listSuggestions() {
  const s = await store("suggestions");
  const list = (await s.get(KEY, { type: "json" })) || [];
  return list.map((x) => ({ ...x, title: nameFromUrl(x.url) || x.url, shop: hostOf(x.url) }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Returns "added", "duplicate" or "full".
export async function addSuggestion({ url, why, name }, guideUrls) {
  const norm = (u) => u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const target = norm(url);
  if (guideUrls.some((u) => norm(u) === target)) return "duplicate";
  return update("suggestions", KEY, (list) => {
    list = list || [];
    if (list.some((x) => norm(x.url) === target)) return { result: "duplicate" };
    if (list.length >= MAX_INBOX) return { result: "full" };
    const item = { id: randomUUID(), url, why, name, createdAt: new Date().toISOString() };
    return { next: [...list, item], result: "added" };
  });
}

export async function removeSuggestion(id) {
  return update("suggestions", KEY, (list) => {
    list = list || [];
    const left = list.filter((x) => x.id !== id);
    if (left.length === list.length) return { result: false };
    return { next: left, result: true };
  });
}

// Up to MAX_PER_DAY suggestions per sender per day. The sender is a one-way hash of
// their network address and the date, so no address is ever stored.
export async function rateLimit(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const secret = env("ADMIN_PASSWORD") || "giftguide";
  const who = createHash("sha256").update(`${secret}|${day}|${ip || "unknown"}`).digest("hex").slice(0, 32);
  return update("suggestion-limits", day, (rec) => {
    rec = rec || {};
    const n = rec[who] || 0;
    if (n >= MAX_PER_DAY) return { result: false };
    return { next: { ...rec, [who]: n + 1 }, result: true };
  });
}
