// Runs during the Netlify build. Social sites need full web addresses for the
// sharing image, so this swaps %SITE_URL% in index.html for the site's address.
// Netlify provides it as URL (your custom domain once you add one).
import { readFile, writeFile } from "node:fs/promises";

const url = (process.env.URL || "https://arseblog-gift-guide.netlify.app").replace(/\/+$/, "");
const file = new URL("../public/index.html", import.meta.url);
const html = await readFile(file, "utf8");
await writeFile(file, html.replaceAll("%SITE_URL%", url));
console.log(`Sharing links point to ${url}`);
