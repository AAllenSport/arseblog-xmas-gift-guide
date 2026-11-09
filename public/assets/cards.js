// Card and shelf rendering shared by the public guide and the admin page.
(function () {
  // Section ids and headings. To rename a heading, change the title here.
  const SECTIONS = [
    { id: "prints", title: "Prints / Posters / Art" },
    { id: "bootleg", title: "Bootleg Merch" },
    { id: "official", title: "Official Merch" },
    { id: "books", title: "Books / Magazines" },
    { id: "stocking", title: "Stocking Fillers" },
  ];

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids) if (kid != null && kid !== false) n.append(kid);
    return n;
  }

  function safeUrl(u) {
    try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
  }

  const slides = {};

  function card(it, opts = {}) {
    const imgs = (Array.isArray(it.images) ? it.images : []).filter((s) => typeof s === "string" && (s.startsWith("/img/") || safeUrl(s)));
    const idx = Math.min(slides[it.id] || 0, Math.max(0, imgs.length - 1));
    const media = el("div", { class: "media" });
    if (imgs.length) {
      const img = el("img", { src: imgs[idx], alt: it.name || "Product photo", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
      img.addEventListener("load", () => { if (img.naturalWidth && img.naturalWidth / img.naturalHeight > 1.15) media.classList.add("contain"); });
      img.addEventListener("error", () => { img.replaceWith(el("div", { class: "ph" }, el("span", { text: it.merchant || "Arseblog picks" }))); });
      media.append(img);
      if (imgs.length > 1) {
        const pager = el("div", { class: "pager" });
        imgs.forEach((_, i) => pager.append(el("button", {
          type: "button", "aria-label": `Photo ${i + 1} of ${imgs.length}`, "aria-current": i === idx ? "true" : "false",
          onclick: (e) => {
            slides[it.id] = i;
            const fresh = card(it, opts);
            e.currentTarget.closest(".card").replaceWith(fresh);
            fresh.querySelectorAll(".pager button")[i]?.focus();
          },
        })));
        media.append(pager);
      }
    } else {
      media.append(el("div", { class: "ph" }, el("span", { text: it.merchant || "Arseblog picks" })));
    }
    if (opts.editing && it.status !== "live") media.append(el("span", { class: "badge", text: "Draft" }));

    const href = safeUrl(it.url);
    const body = el("div", { class: "body" },
      it.merchant ? el("p", { class: "merchant", text: it.merchant }) : null,
      el("h3", { text: it.name || "Untitled gift" }),
      it.description ? el("p", { class: "desc", text: it.description }) : (opts.editing ? el("p", { class: "desc", text: "No description yet." }) : null),
      el("div", { class: "foot" },
        el("span", { class: "price", text: it.price || "" }),
        href ? el("a", { class: "buy", href, target: "_blank", rel: "noopener", text: "Buy now →", "aria-label": `Buy ${it.name || "this gift"} at ${it.merchant || "the shop"}` }) : null));
    const c = el("article", { class: "card" + (it.status && it.status !== "live" ? " draft" : "") }, media, body);
    if (opts.tools) c.append(opts.tools(it));
    return c;
  }

  function sectionItems(items, sec) {
    return items.filter((i) => i.section === sec).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  }

  function renderBar(container, items) {
    container.replaceChildren(...SECTIONS.map((s) => {
      const n = items.filter((i) => i.section === s.id).length;
      return el("a", { href: "#" + s.id }, s.title, el("span", { class: "n", text: String(n) }));
    }));
  }

  function renderShelves(container, items, opts = {}) {
    container.replaceChildren(...SECTIONS.map((s) => {
      const list = sectionItems(items, s.id);
      return el("section", { class: "shelf", id: s.id, "aria-labelledby": "h-" + s.id },
        el("div", { class: "shelf-head" },
          el("h2", { id: "h-" + s.id, text: s.title }),
          el("span", { class: "count", text: list.length ? `${list.length} ${list.length === 1 ? "gift" : "gifts"}` : "" })),
        list.length ? el("div", { class: "grid" }, ...list.map((it) => card(it, opts)))
          : el("p", { class: "empty", text: opts.emptyText || "More picks landing soon." }));
    }));
  }

  function renderSkeleton(container) {
    container.replaceChildren(...SECTIONS.slice(0, 2).map((s) => el("section", { class: "shelf" },
      el("div", { class: "shelf-head" }, el("h2", { text: s.title })),
      el("div", { class: "grid" }, ...[0, 1, 2].map(() => el("div", { class: "card skel", "aria-hidden": "true" },
        el("div", { class: "media" }), el("div", { class: "body" }, el("div", { class: "line", style: "width:40%" }), el("div", { class: "line", style: "width:80%" }))))))));
  }

  window.GiftGuide = { SECTIONS, el, safeUrl, card, sectionItems, renderBar, renderShelves, renderSkeleton };
})();
