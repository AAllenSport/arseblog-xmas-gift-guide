// GET /img/<key>  ->  a stored product photo. Keys are content hashes, so they never change.
import { store } from "../lib/runtime.mjs";

export default async (req) => {
  const key = decodeURIComponent(new URL(req.url).pathname.split("/").pop() || "");
  if (!/^[a-f0-9]{24}\.(jpg|png|webp|gif|avif)$/.test(key)) return new Response("Not found", { status: 404 });
  const s = await store("images");
  const found = await s.getWithMetadata(key, { type: "arrayBuffer" });
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(found.data, {
    headers: {
      "content-type": found.metadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "netlify-cdn-cache-control": "public, durable, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
};

export const config = { path: "/img/:key", method: ["GET"] };
