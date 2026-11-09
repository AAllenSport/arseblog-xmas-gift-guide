// Editors' gift list API. Every request needs the admin password.
//   GET    /api/admin/items                 all gifts, drafts included
//   POST   /api/admin/items                 add a gift            { url, section, name, ... }
//   PUT    /api/admin/items?id=ID           change a gift         { any fields }
//   DELETE /api/admin/items?id=ID           remove a gift
//   PATCH  /api/admin/items                 reorder a section     { section, ids: [...] }
import { SECTIONS } from "../lib/parse-product.mjs";
import { loadItems, saveItems, sortItems, cleanInput, rehostAll, newItem } from "../lib/items.mjs";
import { requireEditor, json, errorResponse, purgeItemsCache } from "../lib/runtime.mjs";

export default async (req) => {
  const denied = await requireEditor(req);
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get("id");
  const items = await loadItems();

  if (req.method === "GET") return json({ items: sortItems(items) });

  let body = {};
  if (req.method !== "DELETE") {
    try { body = await req.json(); } catch { return errorResponse("Send the gift as JSON."); }
  }

  if (req.method === "POST") {
    const { item, error } = cleanInput(body);
    if (error) return errorResponse(error);
    if (items.some((i) => i.url === item.url)) return errorResponse("That link is already in the guide.", 409);
    const { images, warnings } = await rehostAll(item.images, item.url);
    const created = newItem({ ...item, images }, items);
    items.push(created);
    await saveItems(items);
    await purgeItemsCache();
    return json({ item: created, warnings }, 201);
  }

  if (req.method === "PUT") {
    const at = items.findIndex((i) => i.id === id);
    if (at < 0) return errorResponse("That gift no longer exists. Refresh the page.", 404);
    const { item, error } = cleanInput(body, { partial: true });
    if (error) return errorResponse(error);
    let warnings = [];
    if (item.images) ({ images: item.images, warnings } = await rehostAll(item.images, item.url || items[at].url));
    const prev = items[at];
    const next = { ...prev, ...item, updatedAt: new Date().toISOString() };
    if (item.section && item.section !== prev.section) {
      next.order = Math.max(0, ...items.filter((i) => i.section === item.section).map((i) => i.order ?? 0)) + 1;
    }
    items[at] = next;
    await saveItems(items);
    await purgeItemsCache();
    return json({ item: next, warnings });
  }

  if (req.method === "DELETE") {
    const left = items.filter((i) => i.id !== id);
    if (left.length === items.length) return errorResponse("That gift no longer exists. Refresh the page.", 404);
    await saveItems(left);
    await purgeItemsCache();
    return json({ ok: true });
  }

  if (req.method === "PATCH") {
    if (!SECTIONS.includes(body.section) || !Array.isArray(body.ids)) return errorResponse("Send a section and the gift ids in their new order.");
    body.ids.forEach((gid, n) => {
      const it = items.find((i) => i.id === gid && i.section === body.section);
      if (it) it.order = n + 1;
    });
    await saveItems(items);
    await purgeItemsCache();
    return json({ items: sortItems(items) });
  }

  return errorResponse("Unsupported request.", 405);
};

export const config = { path: "/api/admin/items", method: ["GET", "POST", "PUT", "DELETE", "PATCH"] };
