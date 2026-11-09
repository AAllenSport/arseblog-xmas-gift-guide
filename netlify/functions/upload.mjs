// POST /api/admin/upload  (body: the image file, Content-Type: image/*)  ->  { src: "/img/..." }
// For photos an editor uploads themselves. The admin page shrinks big photos first.
import { saveImageBytes } from "../lib/items.mjs";
import { requireEditor, json, errorResponse } from "../lib/runtime.mjs";

export default async (req) => {
  const denied = await requireEditor(req);
  if (denied) return denied;
  const type = req.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return errorResponse("Upload a JPG, PNG, WebP or GIF image.");
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return errorResponse("The image was empty.");
  if (buf.length > 5.5 * 1024 * 1024) return errorResponse("That image is over 5 MB. Try a smaller one.", 413);
  try {
    return json({ src: await saveImageBytes(buf, type) }, 201);
  } catch (e) {
    return errorResponse(e.message);
  }
};

export const config = { path: "/api/admin/upload", method: ["POST"] };
