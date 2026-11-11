// Editors' inbox of reader suggestions.
//   GET    /api/admin/suggestions          the list, newest first
//   DELETE /api/admin/suggestions?id=ID    dismiss one (also used after adding it to the guide)
import { listSuggestions, removeSuggestion } from "../lib/suggestions.mjs";
import { requireEditor, json, errorResponse } from "../lib/runtime.mjs";

export default async (req) => {
  const denied = await requireEditor(req);
  if (denied) return denied;
  if (req.method === "GET") return json({ suggestions: await listSuggestions() });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return errorResponse("Which suggestion?");
  if (!(await removeSuggestion(id))) return errorResponse("That suggestion has already gone. Refresh the page.", 404);
  return json({ ok: true });
};

export const config = { path: "/api/admin/suggestions", method: ["GET", "DELETE"] };
