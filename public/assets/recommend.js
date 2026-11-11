// "Recommend a gift" form: sends a reader's suggestion to the editors' inbox.
(() => {
  const form = document.getElementById("recommendForm");
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const status = $("recStatus");
  const send = $("recSend");
  const say = (text, err) => { status.textContent = text; status.className = "status" + (err ? " err" : ""); };

  // A gentle per-browser limit, on top of the server's own.
  const dayKey = "recs:" + new Date().toISOString().slice(0, 10);
  const sentToday = () => { try { return +(localStorage.getItem(dayKey) || 0); } catch { return 0; } };
  const markSent = () => { try { localStorage.setItem(dayKey, String(sentToday() + 1)); } catch {} };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = $("recUrl").value.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) { say("Paste the full link to the gift, starting with https://", true); $("recUrl").focus(); return; }
    if (sentToday() >= 5) { say("Thanks for all the ideas! That's plenty for today, so please try again tomorrow.", true); return; }
    send.disabled = true;
    say("Sending…");
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, why: $("recWhy").value, name: $("recName").value, website: $("recWebsite").value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't send. Please try again.");
      markSent();
      const name = $("recName").value.trim();
      const done = document.createElement("div");
      done.className = "recommend-done";
      done.setAttribute("role", "status");
      const head = document.createElement("strong");
      head.textContent = name ? `Cheers, ${name}!` : "Cheers!";
      const body = document.createElement("span");
      body.textContent = "We've got your recommendation and we'll take a look. If it's a goer, it'll appear in the guide.";
      const again = document.createElement("button");
      again.type = "button"; again.className = "btn ghost small"; again.textContent = "Recommend another";
      again.style.justifySelf = "start";
      again.addEventListener("click", () => { done.replaceWith(form); form.reset(); say(""); $("recUrl").focus(); });
      done.append(head, body, again);
      form.replaceWith(done);
    } catch (err) {
      say(err.message, true);
    } finally {
      send.disabled = false;
    }
  });
})();
