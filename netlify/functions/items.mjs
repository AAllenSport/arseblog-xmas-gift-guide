// GET /api/items  ->  the live gifts, for the public page. Cached at Netlify's edge
// and cleared whenever an editor saves, so it stays fast under heavy traffic.
import { loadItems, publicView } from "../lib/items.mjs";
import { ITEMS_CACHE_TAG } from "../lib/runtime.mjs";

export default async () => {
  const items = publicView(await loadItems());
  return new Response(JSON.stringify({ items }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, durable, s-maxage=300, stale-while-revalidate=86400",
      "netlify-cache-tag": ITEMS_CACHE_TAG,
    },
  });
};

export const config = { path: "/api/items", method: ["GET"] };
