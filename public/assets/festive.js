// Christmas countdown in the header's small brand line.
// Uses the UK date, so it ticks over at midnight in London.
(() => {
  const box = document.getElementById("countdown");
  const text = document.getElementById("countdownText");
  if (!box || !text) return;
  const CHRISTMAS = { y: 2026, m: 12, d: 25 };

  function ukToday() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  }

  function update() {
    const days = Math.round((Date.UTC(CHRISTMAS.y, CHRISTMAS.m - 1, CHRISTMAS.d) - ukToday()) / 86400000);
    let label = "";
    if (days > 1) label = `${days} days to go`;
    else if (days === 1) label = "Christmas Eve";
    else if (days === 0) label = "Merry Christmas";
    text.textContent = label;
    box.hidden = !label; // after Christmas Day the countdown simply disappears
  }

  update();
  // Keep it right for anyone who leaves the tab open past midnight.
  setInterval(update, 60 * 1000);
})();
