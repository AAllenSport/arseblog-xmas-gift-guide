// POST /api/admin/fetch  { url }  ->  { name, description, images[], price, currency, merchant, url, warnings[] }
// Reads a product page and returns the details for a gift card. Editors only.
import { parseProduct, parseShopifyJs, shopifyJsUrl, shopifyCartUrl, mergeDetails, merchantFromUrl, nameFromUrl, CURRENCY_NAMES } from "../lib/parse-product.mjs";
import { requireEditor, json, errorResponse, checkPublicUrl, fetchLimited } from "../lib/runtime.mjs";

// Our server runs in the US, so many shops would show US prices. These cookies are
// what Shopify's own country picker sets; other shops ignore them.
const UK_SHOPPER = { cookie: "localization=GB; cart_currency=GBP" };

export default async (req) => {
  const denied = await requireEditor(req);
  if (denied) return denied;
  if (req.method !== "POST") return errorResponse("Use POST.", 405);

  let body;
  try { body = await req.json(); } catch { return errorResponse("Send JSON with a url."); }
  const u = checkPublicUrl(body?.url);
  if (!u) return errorResponse("That doesn't look like a product link. It should start with https://");

  const warnings = [];
  let details = { name: "", description: "", images: [], price: "", currency: null, merchant: merchantFromUrl(u.href), url: u.href };

  try {
    const { res, body: html, finalUrl } = await fetchLimited(u, { accept: "text/html,application/xhtml+xml,*/*;q=0.8", maxBytes: 4 * 1024 * 1024, headers: UK_SHOPPER });
    if (!res.ok) throw new Error(`the shop answered with error ${res.status}`);
    details = { ...parseProduct(html.toString("utf8"), finalUrl), url: u.href };
  } catch (e) {
    warnings.push(`Couldn't read the page (${e.code === "too_large" ? "page too large" : e.message}). Some shops, Amazon especially, block automatic reading. Fill in the gaps by hand.`);
  }

  // Shopify stores (Cult Kits, StavesArt and many small makers) have a tidy JSON version.
  const shopUrl = shopifyJsUrl(u.href);
  if (shopUrl && (!details.images.length || !details.description || !details.price || details.images.length < 3)) {
    try {
      const { res, body: raw } = await fetchLimited(shopUrl, { accept: "application/json", maxBytes: 2 * 1024 * 1024, timeoutMs: 8000, headers: UK_SHOPPER });
      if (res.ok) {
        // The product JSON has no currency; the shop's cart says which one it's using.
        let currency = null;
        if (!details.price) {
          try {
            const cart = await fetchLimited(shopifyCartUrl(u.href), { accept: "application/json", maxBytes: 200 * 1024, timeoutMs: 6000, headers: UK_SHOPPER });
            if (cart.res.ok) currency = JSON.parse(cart.body.toString("utf8"))?.currency || null;
          } catch { /* no currency, so no price */ }
        }
        details = mergeDetails(details, parseShopifyJs(JSON.parse(raw.toString("utf8")), u.href, currency));
      }
    } catch { /* not a Shopify store after all */ }
  }

  if (!details.name) details.name = nameFromUrl(u.href);
  if (!details.images.length) warnings.push("No product photo found. Upload one in the form.");
  if (!details.description) warnings.push("No description found. Write a line or two.");
  if (details.price && details.currency && details.currency !== "GBP") {
    const what = CURRENCY_NAMES[details.currency] || details.currency;
    warnings.push(`The shop showed the price in ${what} (${details.price}), probably because our server is in the US. Check the UK price on the shop's site and type it in before saving.`);
  } else if (details.price && !details.currency) {
    warnings.push("The shop didn't say which currency its price is in. Check it's in pounds before saving.");
  }

  return json({ ...details, warnings });
};

export const config = { path: "/api/admin/fetch", method: ["POST"] };
