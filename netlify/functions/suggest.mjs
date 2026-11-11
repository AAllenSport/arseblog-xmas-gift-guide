// POST /api/suggest  { url, why?, name?, website? }  ->  { ok: true }
// A reader recommends a gift. It goes to the editors' inbox; nothing is published.
import { loadItems } from "../lib/items.mjs";
import { addSuggestion, rateLimit } from "../lib/suggestions.mjs";
import { json, errorResponse, checkPublicUrl } from "../lib/runtime.mjs";

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export default async (req, context) => {
  let body;
  try { body = JSON.parse((await req.text()).slice(0, 5000)); } catch { return errorResponse("Something went wrong sending that. Please try again."); }

  // Hidden field only bots fill in: pretend it worked.
  if (clean(body?.website, 200)) return json({ ok: true });

  const u = checkPublicUrl(body?.url);
  if (!u) return errorResponse("That link doesn't look right. Paste the full address, starting with https://");

  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0];
  if (!(await rateLimit(ip))) return errorResponse("Thanks for all the ideas! That's the limit for today, so please try again tomorrow.", 429);

  const items = await loadItems();
  const result = await addSuggestion({ url: u.href, why: clean(body?.why, 280), name: clean(body?.name, 60) }, items.map((i) => i.url));
  if (result === "full") return errorResponse("We've got a lot of suggestions to get through. Please try again in a few days.", 503);
  // A duplicate is still a "thanks": the reader doesn't need to know someone beat them to it.
  return json({ ok: true });
};

export const config = { path: "/api/suggest", method: ["POST"] };
