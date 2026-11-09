// Gift guide admin: sign in, add gifts from a link, edit, reorder, hide, delete.
(() => {
  const G = window.GiftGuide;
  const { el } = G;
  const $ = (id) => document.getElementById(id);
  const KEY = "giftguide-admin";

  let password = "";
  try { password = sessionStorage.getItem(KEY) || ""; } catch {}
  let items = [];
  let draft = null; // { id|null, images: [] } for the open form

  for (const sel of [$("addSection"), $("fSection")]) for (const s of G.SECTIONS) sel.append(el("option", { value: s.id, text: s.title }));

  // ---------- API ----------
  async function api(method, path, body, raw) {
    const headers = { authorization: "Bearer " + password };
    let payload;
    if (raw) { payload = raw; headers["content-type"] = raw.type; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await fetch(path, { method, headers, body: payload });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401) { signOut("Your session ended. Sign in again."); throw new Error(data.error || "Wrong password."); }
    if (!res.ok) throw new Error(data.error || `Something went wrong (error ${res.status}).`);
    return data;
  }

  const setStatus = (node, text, kind = "") => { node.textContent = text; node.className = "status" + (kind ? " " + kind : ""); };

  // ---------- Sign in ----------
  function signOut(message) {
    password = "";
    try { sessionStorage.removeItem(KEY); } catch {}
    $("appView").hidden = true; $("signOut").hidden = true; $("loginView").hidden = false;
    setStatus($("loginStatus"), message || "", message ? "err" : "");
  }
  $("signOut").addEventListener("click", () => signOut());

  async function enter() {
    const data = await api("GET", "/api/admin/items");
    items = data.items;
    try { sessionStorage.setItem(KEY, password); } catch {}
    $("loginView").hidden = true; $("appView").hidden = false; $("signOut").hidden = false;
    render();
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    password = $("pw").value;
    $("loginBtn").disabled = true;
    setStatus($("loginStatus"), "Checking…");
    try { await enter(); $("pw").value = ""; setStatus($("loginStatus"), ""); }
    catch (err) { setStatus($("loginStatus"), err.message, "err"); }
    finally { $("loginBtn").disabled = false; }
  });

  // ---------- Shelves ----------
  function tools(it) {
    const box = el("div", { class: "tools" });
    const list = G.sectionItems(items, it.section);
    const pos = list.findIndex((x) => x.id === it.id);
    const normal = () => box.replaceChildren(
      el("button", { type: "button", text: "Edit", onclick: () => openSheet(it) }),
      el("button", { type: "button", text: "↑", "aria-label": "Move earlier", disabled: pos <= 0, onclick: () => move(it, -1) }),
      el("button", { type: "button", text: "↓", "aria-label": "Move later", disabled: pos >= list.length - 1, onclick: () => move(it, 1) }),
      el("button", { type: "button", text: it.status === "live" ? "Hide" : "Show", onclick: () => quickUpdate(it, { status: it.status === "live" ? "draft" : "live" }) }),
      el("button", { type: "button", class: "danger", text: "Delete", onclick: confirmDelete }));
    const confirmDelete = () => box.replaceChildren(
      el("span", { style: "font-size:12px", text: "Delete this gift?" }),
      el("button", { type: "button", class: "danger", text: "Yes, delete", onclick: () => remove(it) }),
      el("button", { type: "button", text: "Keep", onclick: normal }));
    normal();
    return box;
  }

  function render() {
    G.renderBar($("secbar"), items);
    G.renderShelves($("shelves"), items, { editing: true, tools, emptyText: "No gifts here yet. Paste a link above to add one." });
  }

  async function quickUpdate(it, fields) {
    try {
      const { item } = await api("PUT", "/api/admin/items?id=" + encodeURIComponent(it.id), fields);
      items = items.map((x) => (x.id === item.id ? item : x)); render();
    } catch (e) { setStatus($("addStatus"), e.message, "err"); }
  }

  async function move(it, dir) {
    const ids = G.sectionItems(items, it.section).map((x) => x.id);
    const i = ids.indexOf(it.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { items = (await api("PATCH", "/api/admin/items", { section: it.section, ids })).items; render(); }
    catch (e) { setStatus($("addStatus"), e.message, "err"); }
  }

  async function remove(it) {
    try {
      await api("DELETE", "/api/admin/items?id=" + encodeURIComponent(it.id));
      items = items.filter((x) => x.id !== it.id); render();
      setStatus($("addStatus"), `Deleted “${it.name}”.`, "ok");
    } catch (e) { setStatus($("addStatus"), e.message, "err"); }
  }

  // ---------- Add from link ----------
  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = G.safeUrl($("addUrl").value.trim());
    if (!url || !/^https?:\/\//i.test($("addUrl").value.trim())) return setStatus($("addStatus"), "Paste a full link starting with https://", "err");
    if (items.some((i) => i.url === url)) return setStatus($("addStatus"), "That link is already in the guide.", "err");
    $("addBtn").disabled = true;
    setStatus($("addStatus"), "Reading the shop page…");
    try {
      const d = await api("POST", "/api/admin/fetch", { url });
      setStatus($("addStatus"), "");
      openSheet({ url, name: d.name, merchant: d.merchant, price: d.price, description: d.description, images: d.images, section: $("addSection").value, status: d.name && d.images.length ? "live" : "draft" }, d.warnings, true);
    } catch (err) { setStatus($("addStatus"), err.message, "err"); }
    finally { $("addBtn").disabled = false; }
  });

  // ---------- Form ----------
  function showWarnings(list) {
    const ul = $("sheetWarnings");
    ul.replaceChildren(...(list || []).map((w) => el("li", { text: w })));
    ul.hidden = !list || !list.length;
  }

  function drawThumbs() {
    $("thumbs").replaceChildren(...draft.images.map((src, i) => el("div", { class: "thumb" + (i === 0 ? " cover" : "") },
      el("img", { src, alt: `Photo ${i + 1}`, referrerpolicy: "no-referrer" }),
      i > 0 ? el("button", { type: "button", class: "star", title: "Make this the cover", "aria-label": `Make photo ${i + 1} the cover`, text: "★",
        onclick: () => { draft.images.unshift(...draft.images.splice(i, 1)); drawThumbs(); } }) : null,
      el("button", { type: "button", class: "x", "aria-label": `Remove photo ${i + 1}`, text: "×", onclick: () => { draft.images.splice(i, 1); drawThumbs(); } }),
      i === 0 ? el("span", { class: "tag", text: "Cover" }) : null)));
  }

  function openSheet(it, warnings, isNew) {
    draft = { id: isNew ? null : it.id, images: [...(it.images || [])] };
    $("sheetTitle").textContent = isNew ? "New gift" : "Edit gift";
    $("fUrl").value = it.url || ""; $("fName").value = it.name || ""; $("fMerchant").value = it.merchant || "";
    $("fPrice").value = it.price || ""; $("fSection").value = it.section || "prints"; $("fDesc").value = it.description || "";
    $("fLive").checked = it.status === "live"; $("fImgUrl").value = "";
    $("saveBtn").textContent = isNew ? "Save gift" : "Save changes";
    showWarnings(warnings); setStatus($("sheetStatus"), "");
    drawThumbs();
    $("scrim").hidden = false; document.body.style.overflow = "hidden";
    $("fName").focus();
  }
  function closeSheet() { $("scrim").hidden = true; document.body.style.overflow = ""; draft = null; }
  $("cancelBtn").addEventListener("click", closeSheet);
  $("scrim").addEventListener("click", (e) => { if (e.target === $("scrim")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("scrim").hidden) closeSheet(); });

  $("refreshBtn").addEventListener("click", async () => {
    const url = $("fUrl").value.trim();
    $("refreshBtn").disabled = true; setStatus($("sheetStatus"), "Reading the shop page…");
    try {
      const d = await api("POST", "/api/admin/fetch", { url });
      const got = [];
      if (d.images.length) { draft.images = [...new Set([...draft.images, ...d.images])].slice(0, 6); drawThumbs(); got.push("photos"); }
      if (d.price) { $("fPrice").value = d.price; got.push("price"); }
      if (d.description && !$("fDesc").value.trim()) { $("fDesc").value = d.description; got.push("description"); }
      if (d.name && !$("fName").value.trim()) { $("fName").value = d.name; got.push("name"); }
      if (d.merchant && !$("fMerchant").value.trim()) { $("fMerchant").value = d.merchant; got.push("shop"); }
      showWarnings(d.warnings);
      setStatus($("sheetStatus"), got.length ? `Updated ${got.join(", ")} from the shop page.` : "Nothing new found on the shop page.", got.length ? "ok" : "");
    } catch (e) { setStatus($("sheetStatus"), e.message, "err"); }
    finally { $("refreshBtn").disabled = false; }
  });

  // Photos: shrink big ones in the browser, then upload.
  async function shrink(file) {
    if (file.type === "image/gif" || (file.size < 1.5 * 1024 * 1024 && !/heic|heif/i.test(file.type))) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((r) => c.toBlob((b) => r(b || file), "image/jpeg", 0.86));
    } catch { return file; }
  }
  async function addFiles(files) {
    const imgs = [...files].filter((f) => f && f.type && f.type.startsWith("image/"));
    for (const f of imgs) {
      if (!draft) return;
      if (draft.images.length >= 6) return setStatus($("sheetStatus"), "Six photos is the limit.", "err");
      setStatus($("sheetStatus"), "Uploading photo…");
      try {
        const { src } = await api("POST", "/api/admin/upload", undefined, await shrink(f));
        if (draft) { draft.images.push(src); drawThumbs(); }
        setStatus($("sheetStatus"), "Photo added.", "ok");
      } catch (e) { setStatus($("sheetStatus"), e.message, "err"); }
    }
  }
  $("fFiles").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
  document.addEventListener("paste", (e) => {
    if ($("scrim").hidden) return;
    const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === "file").map((i) => i.getAsFile());
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  $("addImgUrl").addEventListener("click", () => {
    const u = G.safeUrl($("fImgUrl").value.trim());
    if (!u) return setStatus($("sheetStatus"), "Paste a full image address starting with https://", "err");
    if (draft.images.length >= 6) return setStatus($("sheetStatus"), "Six photos is the limit.", "err");
    draft.images.push(u); $("fImgUrl").value = ""; drawThumbs();
  });

  $("sheet").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!draft) return;
    const fields = {
      url: $("fUrl").value.trim(), name: $("fName").value.trim(), merchant: $("fMerchant").value.trim(),
      price: $("fPrice").value.trim(), section: $("fSection").value, description: $("fDesc").value.trim(),
      images: draft.images, status: $("fLive").checked ? "live" : "draft",
    };
    if (!fields.name) return setStatus($("sheetStatus"), "Give the gift a name.", "err");
    $("saveBtn").disabled = true;
    setStatus($("sheetStatus"), draft.images.some((s) => !s.startsWith("/img/")) ? "Saving and copying photos…" : "Saving…");
    try {
      const res = draft.id
        ? await api("PUT", "/api/admin/items?id=" + encodeURIComponent(draft.id), fields)
        : await api("POST", "/api/admin/items", fields);
      items = draft.id ? items.map((x) => (x.id === res.item.id ? res.item : x)) : [...items, res.item];
      closeSheet(); render();
      const msg = `Saved “${res.item.name}”${res.item.status === "live" ? ". It's on the guide now." : " as a draft."}`;
      setStatus($("addStatus"), res.warnings?.length ? msg + " " + res.warnings.join(" ") : msg, res.warnings?.length ? "" : "ok");
      if (!fields.url || fields.url === $("addUrl").value.trim()) $("addUrl").value = "";
      document.getElementById(res.item.section)?.scrollIntoView();
    } catch (err) { setStatus($("sheetStatus"), err.message, "err"); }
    finally { $("saveBtn").disabled = false; }
  });

  // Resume a session in this tab.
  if (password) enter().catch(() => signOut());
})();
