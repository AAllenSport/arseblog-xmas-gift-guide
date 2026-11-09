// POST /api/admin/fetch  { url }  ->  { name, description, images[], price, merchant, url, warnings[] }
// Reads a product page and returns the details for a gift card. Editors only.
import { parseProduct, parseShopifyJs, shopifyJsUrl, mergeDetails, merchantFromUrl, nameFromUrl } from "../lib/parse-product.mjs";
import { requireEditor, json, errorResponse, checkPublicUrl, fetchLimited } from "../lib/runtime.mjs";

export default async (req) => {
  const denied = await requireEditor(req);
  if (denied) return denied;
  if (req.method !== "POST") return errorResponse("Use POST.", 405);

  let body;
  try { body = await req.json(); } catch { return errorResponse("Send JSON with a url."); }
  const u = checkPublicUrl(body?.url);
  if (!u) return errorResponse("That doesn't look like a product link. It should start with https://");

  const warnings = [];
  let details = { name: "", description: "", images: [], price: "", merchant: merchantFromUrl(u.href), url: u.href };

  try {
    const { res, body: html, finalUrl } = await fetchLimited(u, { accept: "text/html,application/xhtml+xml,*/*;q=0.8", maxBytes: 4 * 1024 * 1024 });
    if (!res.ok) throw new Error(`the shop answered with error ${res.status}`);
    details = { ...parseProduct(html.toString("utf8"), finalUrl), url: u.href };
  } catch (e) {
    warnings.push(`Couldn't read the page (${e.code === "too_large" ? "page too large" : e.message}). Some shops, Amazon especially, block automatic reading. Fill in the gaps by hand.`);
  }

  // Shopify stores (Cult Kits, StavesArt and many small makers) have a tidy JSON version.
  const shopUrl = shopifyJsUrl(u.href);
  if (shopUrl && (!details.images.length || !details.description || !details.price || details.images.length < 3)) {
    try {
      const { res, body: raw } = await fetchLimited(shopUrl, { accept: "application/json", maxBytes: 2 * 1024 * 1024, timeoutMs: 8000 });
      if (res.ok) details = mergeDetails(details, parseShopifyJs(JSON.parse(raw.toString("utf8")), u.href));
    } catch { /* not a Shopify store after all */ }
  }

  if (!details.name) details.name = nameFromUrl(u.href);
  if (!details.images.length) warnings.push("No product photo found. Upload one in the form.");
  if (!details.description) warnings.push("No description found. Write a line or two.");

  return json({ ...details, warnings });
};

export const config = { path: "/api/admin/fetch", method: ["POST"] };
