// Run the whole site on your own computer without a Netlify account:
//   npm run dev        then open http://localhost:8888  (admin: /admin, password: localpassword)
// Data is kept in the .data folder. On Netlify none of this file is used.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readdirSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.GIFTGUIDE_LOCAL_STORE ??= path.join(root, ".data");
process.env.ADMIN_PASSWORD ??= "localpassword";
const PORT = Number(process.env.PORT || 8888);

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

// Load each function and its route
const routes = [];
const fnDir = path.join(root, "netlify/functions");
for (const f of readdirSync(fnDir).filter((f) => f.endsWith(".mjs"))) {
  const mod = await import(pathToFileURL(path.join(fnDir, f)));
  const pattern = new RegExp("^" + mod.config.path.replace(/:[a-z]+/gi, "[^/]+") + "$");
  routes.push({ pattern, methods: [].concat(mod.config.method || ["GET"]), handler: mod.default });
}

// Optional pretend shop for automated tests (MOCK_SHOP=1)
async function mockShop(pathname, res) {
  const dir = path.join(root, "test/fixtures");
  if (pathname === "/__shop/products/gunners-scarf") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(await readFile(path.join(dir, "scarf.html")));
  }
  if (pathname === "/__shop/products/gunners-scarf.js") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ title: "Gunners Scarf", description: "<p>Knitted.</p>", price: 1800, images: [`//localhost:${PORT}/__shop/img/scarf-back.png`] }));
  }
  if (pathname.startsWith("/__shop/img/")) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(await readFile(path.join(dir, "pixel.png")));
  }
  if (pathname === "/__shop/blocked") { res.writeHead(403); return res.end("Forbidden"); }
  res.writeHead(404); res.end();
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (process.env.MOCK_SHOP === "1" && url.pathname === "/products/gunners-scarf.js") return await mockShop("/__shop/products/gunners-scarf.js", res);
    if (process.env.MOCK_SHOP === "1" && url.pathname.startsWith("/__shop/")) return await mockShop(url.pathname, res);

    const route = routes.find((r) => r.pattern.test(url.pathname));
    if (route) {
      if (!route.methods.includes(req.method)) { res.writeHead(405); return res.end(); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      const response = await route.handler(request, {});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }

    let file = url.pathname === "/" ? "/index.html" : url.pathname === "/admin" ? "/admin.html" : url.pathname;
    file = path.join(root, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(path.join(root, "public"))) { res.writeHead(403); return res.end(); }
    let data = await readFile(file);
    if (file.endsWith(".html")) data = Buffer.from(data.toString("utf8").replaceAll("%SITE_URL%", `http://localhost:${PORT}`));
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    if (e.code === "ENOENT") { res.writeHead(404); return res.end("Not found"); }
    console.error(e);
    res.writeHead(500); res.end("Server error");
  }
}).listen(PORT, () => console.log(`Gift guide running at http://localhost:${PORT}  (admin: /admin, password: ${process.env.ADMIN_PASSWORD === "localpassword" ? "localpassword" : "from ADMIN_PASSWORD"})`));
