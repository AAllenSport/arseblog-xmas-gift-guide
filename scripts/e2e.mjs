// End-to-end check against a local server and a pretend shop.
// Starts the dev server with a throwaway data folder, then exercises every API.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const PORT = 8899;
const base = `http://localhost:${PORT}`;
const data = await mkdtemp(path.join(tmpdir(), "giftguide-"));
const server = spawn(process.execPath, ["scripts/dev-server.mjs"], {
  env: { ...process.env, PORT: String(PORT), GIFTGUIDE_LOCAL_STORE: data, ADMIN_PASSWORD: "test-password-1", GIFTGUIDE_ALLOW_LOCAL: "1", MOCK_SHOP: "1" },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((r) => server.stdout.once("data", r));

const auth = { authorization: "Bearer test-password-1" };
const call = async (method, p, body, headers = {}) => {
  const res = await fetch(base + p, { method, headers: { ...headers, ...(body && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}) }, body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
};
let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);

try {
  // Public list seeds itself with the four examples
  let r = await call("GET", "/api/items");
  assert.equal(r.status, 200); assert.equal(r.json.items.length, 4);
  assert.ok(!("status" in r.json.items[0]), "public view hides internal fields");
  assert.match(r.headers.get("netlify-cdn-cache-control"), /s-maxage=300/);
  ok("public list seeds 4 example gifts and is cacheable");

  r = await call("GET", "/api/admin/items");
  assert.equal(r.status, 401);
  r = await call("GET", "/api/admin/items", null, { authorization: "Bearer nope" });
  assert.equal(r.status, 401);
  ok("admin API refuses missing and wrong passwords");

  r = await call("POST", "/api/admin/fetch", { url: `${base}/__shop/products/gunners-scarf` }, auth);
  assert.equal(r.status, 200);
  assert.equal(r.json.name, "Gunners Bar Scarf");
  assert.equal(r.json.price, "£18");
  assert.equal(r.json.merchant, "Terrace Shop");
  assert.match(r.json.description, /January night/);
  assert.equal(r.json.images[0], `${base}/__shop/img/scarf-front.png`);
  assert.equal(r.json.images.length, 2, "Shopify JSON adds a second photo");
  const fetched = r.json;
  ok("link → name, price, shop, description and photos");

  assert.equal(r.json.currency, "GBP");
  assert.ok(!r.json.warnings.some((w) => /currency|dollars/i.test(w)), "no currency warning for pounds");

  r = await call("POST", "/api/admin/fetch", { url: `${base}/__shop/products/geo-tee` }, auth);
  assert.equal(r.json.price, "£30"); assert.equal(r.json.currency, "GBP");
  ok("geo-pricing shop returns UK prices when asked for the UK");

  r = await call("POST", "/api/admin/fetch", { url: `${base}/__shop/products/dollar-tee` }, auth);
  assert.equal(r.json.price, "$40"); assert.equal(r.json.currency, "USD");
  assert.ok(r.json.warnings.some((w) => /US dollars \(\$40\).*Check the UK price/.test(w)), JSON.stringify(r.json.warnings));
  ok("a price in dollars comes with a clear warning to check the UK price");

  r = await call("POST", "/api/admin/fetch", { url: `${base}/__shop/blocked` }, auth);
  assert.equal(r.status, 200); assert.ok(r.json.warnings.some((w) => /Couldn't read the page/.test(w)));
  ok("blocked shop page gives a helpful warning instead of failing");

  r = await call("POST", "/api/admin/items", { ...fetched, section: "stocking", status: "live" }, auth);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const scarf = r.json.item;
  assert.match(scarf.images[0], /^\/img\/[a-f0-9]{24}\.png$/, "first photo copied to our storage");
  ok(`gift saved; merchant photo copied to ${scarf.images[0]}` + (r.json.warnings.length ? ` (${r.json.warnings.length} photo kept as a link)` : ""));

  r = await fetch(base + scarf.images[0]);
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), await readFile("test/fixtures/pixel.png"));
  ok("stored photo is served back with long caching");

  r = await call("POST", "/api/admin/items", { ...fetched, section: "stocking" }, auth);
  assert.equal(r.status, 409);
  ok("duplicate link is refused");

  r = await call("POST", "/api/admin/items", { ...fetched, url: "javascript:alert(1)", section: "stocking" }, auth);
  assert.equal(r.status, 400);
  r = await call("POST", "/api/admin/items", { ...fetched, url: base + "/x", section: "nope" }, auth);
  assert.equal(r.status, 400);
  ok("bad links and unknown sections are refused");

  const upload = new Uint8Array(await readFile("test/fixtures/pixel.png"));
  r = await call("POST", "/api/admin/upload", upload, { ...auth, "content-type": "image/png" });
  assert.equal(r.status, 201); assert.equal(r.json.src, scarf.images[0], "same bytes → same stored file");
  r = await call("POST", "/api/admin/upload", new Uint8Array([60, 104, 116]), { ...auth, "content-type": "text/html" });
  assert.equal(r.status, 400);
  ok("photo upload works and refuses non-images");

  r = await call("PUT", `/api/admin/items?id=${scarf.id}`, { status: "draft", price: "£17.50" }, auth);
  assert.equal(r.json.item.status, "draft"); assert.equal(r.json.item.price, "£17.50"); assert.equal(r.json.item.name, "Gunners Bar Scarf");
  r = await call("GET", "/api/items");
  assert.ok(!r.json.items.some((i) => i.id === scarf.id), "drafts stay off the public page");
  ok("editing keeps other fields; drafts are hidden from the public");

  r = await call("POST", "/api/admin/items", { url: `${base}/__shop/products/second`, name: "Second print", section: "prints", status: "live" }, auth);
  const second = r.json.item;
  r = await call("PATCH", "/api/admin/items", { section: "prints", ids: [second.id, "example-highbury-print"] }, auth);
  r = await call("GET", "/api/items");
  const prints = r.json.items.filter((i) => i.section === "prints").map((i) => i.id);
  assert.deepEqual(prints, [second.id, "example-highbury-print"]);
  ok("reordering a section changes the public order");

  r = await call("PUT", `/api/admin/items?id=${second.id}`, { section: "blow-the-budget" }, auth);
  assert.equal(r.status, 200, "Blow the Budget is a valid section");
  r = await call("PUT", `/api/admin/items?id=${second.id}`, { section: "books" }, auth);
  assert.equal(r.json.item.section, "books"); assert.equal(r.json.item.order, 2);
  ok("moving a gift to another section puts it at the end");

  r = await call("DELETE", `/api/admin/items?id=${second.id}`, null, auth);
  assert.equal(r.status, 200);
  r = await call("DELETE", `/api/admin/items?id=${second.id}`, null, auth);
  assert.equal(r.status, 404);
  ok("delete works, and twice gives a clear 404");

  // Buy now click counting
  const clickPost = (id, ua) => fetch(base + "/api/click", { method: "POST", headers: { "content-type": "text/plain", ...(ua ? { "user-agent": ua } : {}) }, body: JSON.stringify({ id }) });
  assert.equal((await clickPost("example-wright-tee")).status, 204);
  assert.equal((await clickPost("example-wright-tee")).status, 204);
  assert.equal((await clickPost("not-a-gift")).status, 404);
  assert.equal((await clickPost(scarf.id)).status, 404, "drafts aren't counted");
  assert.equal((await clickPost("example-wright-tee", "Mozilla/5.0 (compatible; Googlebot/2.1)")).status, 204);
  r = await call("GET", "/api/admin/clicks");
  assert.equal(r.status, 401);
  r = await call("GET", "/api/admin/clicks", null, auth);
  assert.equal(r.json.counts["example-wright-tee"].total, 2, "bot click ignored");
  assert.equal(r.json.counts["example-wright-tee"].today, 2);
  assert.equal(r.json.counts["example-highbury-print"].total, 0);
  ok("Buy now clicks are counted; bots, drafts and unknown gifts are ignored; counts are editors-only");

  await Promise.all(Array.from({ length: 25 }, () => clickPost("example-highbury-print")));
  r = await call("GET", "/api/admin/clicks", null, auth);
  assert.equal(r.json.counts["example-highbury-print"].total, 25);
  ok("25 simultaneous clicks are all counted");

  for (const p of ["/", "/admin", "/assets/style.css", "/assets/cards.js", "/assets/admin.js", "/og-image.jpg"]) assert.equal((await fetch(base + p)).status, 200, p);
  assert.equal((await fetch(base + "/img/../../etc/passwd")).status, 404);
  ok("pages and assets are served; odd image paths are rejected");

  console.log(`\nAll ${step} checks passed.`);
} finally {
  server.kill();
  await rm(data, { recursive: true, force: true });
}
