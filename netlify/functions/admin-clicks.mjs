// GET /api/admin/clicks  ->  { counts: { <gift id>: { total, today, last7, last } } }
// Buy now click counts for the admin page. Editors only.
import { loadItems } from "../lib/items.mjs";
import { countsFor } from "../lib/clicks.mjs";
import { requireEditor, json } from "../lib/runtime.mjs";

export default async (req) => {
  const denied = await requireEditor(req);
  if (denied) return denied;
  const items = await loadItems();
  return json({ counts: await countsFor(items.map((i) => i.id)) });
};

export const config = { path: "/api/admin/clicks", method: ["GET"] };
