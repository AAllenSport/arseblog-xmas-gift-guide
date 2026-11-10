// Turns a product page's HTML into gift-card details.
// Reads, in order of trust: schema.org JSON-LD (what Google Shopping uses),
// Open Graph / Twitter meta tags, then the page title and meta description.
import { parse } from "node-html-parser";

export const SECTIONS = ["prints", "bootleg", "official", "books", "stocking", "blow-the-budget"];

const MERCHANTS = {
  "cultkits.com": "Cult Kits",
  "notonthehighstreet.com": "Not On The High Street",
  "arsenal.com": "Arsenal Direct",
  "amazon.co.uk": "Amazon",
  "amazon.com": "Amazon",
  "etsy.com": "Etsy",
  "ebay.co.uk": "eBay",
  "ebay.com": "eBay",
  "waterstones.com": "Waterstones",
  "hatchards.co.uk": "Hatchards",
  "blackwells.co.uk": "Blackwell's",
  "bookshop.org": "Bookshop.org",
  "stavesart.com": "StavesArt",
  "britishmade.gifts": "British Made Gifts",
  "adidas.co.uk": "adidas",
  "adidas.com": "adidas",
  "sportsdirect.com": "Sports Direct",
  "jdsports.co.uk": "JD Sports",
  "foyles.co.uk": "Foyles",
  "pitchinternational.com": "Pitch Publishing",
};

const SLUG_SKIP = new Set(["products", "product", "p", "dp", "itm", "item", "listing", "collections", "shop", "book", "books", "en", "en-gb", "uk", "gp", "store"]);

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}

export function merchantFromUrl(url) {
  const h = hostOf(url);
  if (!h) return "";
  for (const [d, name] of Object.entries(MERCHANTS)) if (h === d || h.endsWith("." + d)) return name;
  const parts = h.split(".");
  // shop.example.co.uk -> example ; example.com -> example
  let core = parts.length >= 3 && parts.at(-2).length <= 3 ? parts.at(-3) : parts.at(-2) ?? parts[0];
  core = (core || "").replace(/[-_]+/g, " ");
  return core.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function nameFromUrl(url) {
  let segs;
  try { segs = new URL(url).pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s)); } catch { return ""; }
  const pick = segs.reverse().find((s) => /[a-z]/i.test(s) && s.includes("-") && !SLUG_SKIP.has(s.toLowerCase()) && !/^[A-Z0-9]{8,}$/.test(s));
  if (!pick) return "";
  return pick.replace(/\.[a-z]{2,5}$/i, "").replace(/[-_]+/g, " ").replace(/\b\d{6,}\b/g, "").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bFc\b/g, "FC");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£", euro: "€", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×", copy: "©", reg: "®", trade: "™" };
export function decodeEntities(s) {
  return String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function cleanText(s) {
  return decodeEntities(String(s ?? "")
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// Card-length description: whole sentences up to ~300 characters.
export function shortDescription(s, max = 300) {
  const t = cleanText(s);
  if (t.length <= max) return t;
  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
  let out = "";
  for (const sen of sentences) {
    if ((out + sen).length > max) break;
    out += sen;
  }
  out = out.trim();
  if (out.length >= 80) return out;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
}

const SYMBOLS = { GBP: "£", USD: "$", EUR: "€", AUD: "A$", CAD: "C$" };
export function formatPrice(amount, currency) {
  if (amount == null || amount === "") return "";
  const n = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  const cur = String(currency || "GBP").toUpperCase();
  const num = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return SYMBOLS[cur] ? SYMBOLS[cur] + num : `${num} ${cur}`;
}

function absolute(u, base) {
  if (!u || typeof u !== "string") return null;
  try {
    const abs = new URL(u.trim(), base);
    return /^https?:$/.test(abs.protocol) ? abs.href : null;
  } catch { return null; }
}

function imageUrls(v) {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(imageUrls);
  if (typeof v === "object") return imageUrls(v.url || v.contentUrl || v["@id"]);
  return [];
}

function typesOf(node) {
  const t = node?.["@type"];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
}

function flattenLd(data, out = []) {
  if (!data) return out;
  if (Array.isArray(data)) { data.forEach((d) => flattenLd(d, out)); return out; }
  if (typeof data !== "object") return out;
  out.push(data);
  if (data["@graph"]) flattenLd(data["@graph"], out);
  if (data.mainEntity) flattenLd(data.mainEntity, out);
  if (Array.isArray(data.hasVariant)) flattenLd(data.hasVariant.slice(0, 1), out);
  return out;
}

function firstOffer(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    if (o.offers) { const inner = firstOffer(o.offers); if (inner) return inner; }
    const price = o.price ?? o.lowPrice ?? o.priceSpecification?.price;
    if (price != null && price !== "") return { price, currency: o.priceCurrency ?? o.priceSpecification?.priceCurrency, seller: o.seller?.name };
  }
  return null;
}

export function parseProduct(html, url) {
  const root = parse(html || "", { blockTextElements: { script: true, style: false, pre: true, noscript: false } });

  // Meta tags (property= or name=; first value wins, images collect all)
  const meta = {};
  const metaImages = [];
  for (const m of root.querySelectorAll("meta")) {
    const key = (m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop") || "").toLowerCase().trim();
    const content = m.getAttribute("content");
    if (!key || content == null) continue;
    if (["og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src"].includes(key)) metaImages.push(content);
    else if (!(key in meta)) meta[key] = content;
  }

  // JSON-LD
  let product = null;
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    const raw = (s.rawText || s.text || "").trim().replace(/^<!--|-->$/g, "");
    try { data = JSON.parse(raw); } catch {
      try { data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")); } catch { continue; }
    }
    const nodes = flattenLd(data);
    product = nodes.find((n) => typesOf(n).some((t) => /^(Product|ProductGroup|IndividualProduct|Book|ProductModel|Vehicle)$/i.test(t))) || product;
    if (product) break;
  }

  const offer = product ? firstOffer(product.offers) : null;
  const siteName = cleanText(meta["og:site_name"] || meta["application-name"] || "");
  const titleTag = cleanText(root.querySelector("title")?.text || "");

  let name = cleanText(product?.name || meta["og:title"] || meta["twitter:title"] || titleTag || "");
  // Strip " | Shop Name" / " – Shop Name" suffixes
  if (siteName) name = name.replace(new RegExp(`\\s*[|–—-]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
  // Page titles often end "| Brand" even without og:site_name; product names from JSON-LD don't.
  if (!product?.name) name = name.replace(/\s+\|\s+[^|]{2,40}$/, "").trim();

  const description = shortDescription(product?.description || meta["og:description"] || meta["twitter:description"] || meta["description"] || "");

  const images = [...new Set([...imageUrls(product?.image), ...metaImages]
    .map((u) => absolute(cleanText(u), url))
    .filter(Boolean)
    .map((u) => (/^http:\/\/(localhost|127\.)/i.test(u) ? u : u.replace(/^http:\/\//i, "https://"))))]
    .slice(0, 6);

  const price = formatPrice(
    offer?.price ?? meta["product:price:amount"] ?? meta["og:price:amount"],
    offer?.currency ?? meta["product:price:currency"] ?? meta["og:price:currency"] ?? "GBP");

  const merchant = siteName && siteName.length <= 40 ? siteName : merchantFromUrl(url);

  return { name: name || nameFromUrl(url), description, images, price, merchant, url };
}

// Shopify stores expose /products/<handle>.js with clean product JSON.
export function shopifyJsUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/products\/([^/?#]+)/);
    return m ? `${u.origin}/products/${m[1].replace(/\.(js|json)$/, "")}.js` : null;
  } catch { return null; }
}

export function parseShopifyJs(json, url) {
  if (!json || typeof json !== "object" || !json.title) return null;
  const images = (json.images || []).map((i) => absolute(String(i).startsWith("//") ? "https:" + i : i, url)).filter(Boolean).slice(0, 6);
  const pence = Number(json.price ?? json.price_min);
  return {
    name: cleanText(json.title),
    description: shortDescription(json.description || ""),
    images,
    price: Number.isFinite(pence) && pence > 0 ? formatPrice(pence / 100, "GBP") : "",
  };
}

// Combine: page data first, Shopify fills gaps (and usually has more photos).
export function mergeDetails(page, shop) {
  if (!shop) return page;
  return {
    ...page,
    name: page.name || shop.name,
    description: page.description || shop.description,
    images: [...new Set([...(page.images || []), ...(shop.images || [])])].slice(0, 6),
    price: page.price || shop.price,
  };
}
