// POST /api/click  { id }  ->  204
// Sent by the public page when a reader presses "Buy now". Anonymous: nothing
// about the reader is stored. Only live gifts are counted, and obvious bots are ignored.
import { loadItems } from "../lib/items.mjs";
import { recordClick } from "../lib/clicks.mjs";

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|python-requests|curl|wget/i;
const done = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export default async (req) => {
  if (BOTS.test(req.headers.get("user-agent") || "")) return done();
  let id;
  try { id = JSON.parse((await req.text()).slice(0, 500))?.id; } catch { return done(400); }
  if (typeof id !== "string" || !id || id.length > 100) return done(400);
  const items = await loadItems();
  if (!items.some((i) => i.id === id && i.status === "live")) return done(404);
  try { await recordClick(id); } catch (e) { console.warn(e.message); return done(503); }
  return done();
};

export const config = { path: "/api/click", method: ["POST"] };
