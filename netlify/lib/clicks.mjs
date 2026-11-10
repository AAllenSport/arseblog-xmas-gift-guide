// Buy now click counts, one small record per gift:
//   { total, days: { "2026-11-10": 4, ... }, last: ISO time }
// Counting is anonymous: no cookies, no IP addresses, nothing about the reader.
import { store } from "./runtime.mjs";

const KEEP_DAYS = 90;
const keyFor = (id) => "item-" + String(id).replace(/[^a-zA-Z0-9_-]/g, "_");

// The day in UK time, so "today" in the admin matches the editors' day.
export function ukDay(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function addClick(rec, now) {
  const day = ukDay(now);
  const days = { ...(rec?.days || {}) };
  days[day] = (days[day] || 0) + 1;
  const cutoff = ukDay(new Date(now.getTime() - KEEP_DAYS * 86400000));
  for (const d of Object.keys(days)) if (d < cutoff) delete days[d];
  return { total: (rec?.total || 0) + 1, days, last: now.toISOString() };
}

// Adds one click safely even when many readers click at once: each write only
// succeeds if nobody else changed the record since we read it; otherwise retry.
export async function recordClick(id, now = new Date()) {
  const s = await store("clicks");
  const key = keyFor(id);
  for (let attempt = 0; attempt < 10; attempt++) {
    const found = await s.getWithMetadata(key, { type: "json" });
    const next = addClick(found?.data, now);
    const res = found
      ? await s.setJSON(key, next, { onlyIfMatch: found.etag })
      : await s.setJSON(key, next, { onlyIfNew: true });
    if (res?.modified !== false) return next;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("Too many simultaneous clicks; this one wasn't counted.");
}

export function summarise(rec, now = new Date()) {
  const days = rec?.days || {};
  const today = ukDay(now);
  const weekStart = ukDay(new Date(now.getTime() - 6 * 86400000));
  let last7 = 0;
  for (const [d, n] of Object.entries(days)) if (d >= weekStart && d <= today) last7 += n;
  return { total: rec?.total || 0, today: days[today] || 0, last7, last: rec?.last || null };
}

export async function countsFor(ids) {
  const s = await store("clicks");
  const now = new Date();
  const entries = await Promise.all(ids.map(async (id) => [id, summarise(await s.get(keyFor(id), { type: "json" }), now)]));
  return Object.fromEntries(entries);
}
