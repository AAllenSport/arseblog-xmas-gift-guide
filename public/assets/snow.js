// Falling Arseblog ermine (or plain snow) behind the header text.
// - Off for readers who've asked for reduced motion
// - Pauses when the header is off-screen or the tab is hidden
// - To turn it off for good, delete the <script src="/assets/snow.js"> line in index.html
(() => {
  const header = document.querySelector(".masthead");
  if (!header || !window.HTMLCanvasElement) return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) return;

  // "snow" for plain snowflakes, "ermine" for falling Arseblog ermine spots,
  // "mix" for snow with the odd ermine drifting through it.
  const STYLE = "mix";
  const ERMINE_SHARE = 0.12;  // in "mix", roughly 1 in 8 is an ermine
  const DENSITY = STYLE === "ermine" ? 0.00004 : 0.00012; // per square pixel of header (~40 ermine or ~120 flakes on a laptop)
  const MAX_FLAKES = STYLE === "ermine" ? 50 : 180;

  // The ermine spot from the Arseblog brand, drawn in a 100 x 150 box (three dots over a tail).
  const ERMINE = new Path2D();
  ERMINE.arc(50, 14, 14.5, 0, Math.PI * 2); ERMINE.closePath();
  ERMINE.moveTo(33.5, 44); ERMINE.arc(19, 44, 14.5, 0, Math.PI * 2); ERMINE.closePath();
  ERMINE.moveTo(95.5, 44); ERMINE.arc(81, 44, 14.5, 0, Math.PI * 2); ERMINE.closePath();
  ERMINE.moveTo(50, 38);
  ERMINE.bezierCurveTo(42, 66, 34, 98, 10, 114);
  ERMINE.quadraticCurveTo(34, 107, 41, 118);
  ERMINE.lineTo(50, 144); ERMINE.lineTo(59, 118);
  ERMINE.quadraticCurveTo(66, 107, 90, 114);
  ERMINE.bezierCurveTo(66, 98, 58, 66, 50, 38); ERMINE.closePath();

  const canvas = document.createElement("canvas");
  canvas.className = "snow";
  canvas.setAttribute("aria-hidden", "true");
  header.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let w = 0, h = 0, dpr = 1, flakes = [], running = false, visible = true, last = 0, raf = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  function makeFlake(anywhere) {
    // r is the size: a radius for snow, half the height for an ermine. Bigger ones fall faster: a little depth.
    const ermine = STYLE === "ermine" || (STYLE === "mix" && Math.random() < ERMINE_SHARE);
    const r = ermine ? rand(9, 18) : rand(1.2, 3.6);
    return {
      ermine, x: rand(0, w), y: anywhere ? rand(0, h) : rand(-40, -2 * r),
      r, vy: ermine ? 10 + r * 1.6 : 8 + r * 8, drift: rand(6, 16), phase: rand(0, Math.PI * 2), sway: rand(0.4, 1.1),
      a: ermine ? rand(0.5, 0.9) : rand(0.6, 0.95),
      tilt: rand(0.15, 0.35),
    };
  }

  function resize() {
    const rect = header.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.min(MAX_FLAKES, Math.round(w * h * DENSITY));
    while (flakes.length < target) flakes.push(makeFlake(true));
    flakes.length = target;
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    for (const f of flakes) {
      f.phase += dt * f.sway;
      f.y += f.vy * dt;
      f.x += Math.sin(f.phase) * f.drift * dt;
      if (f.y - f.r > h) Object.assign(f, makeFlake(false));
      if (f.x < -2 * f.r) f.x = w + 2 * f.r; else if (f.x > w + 2 * f.r) f.x = -2 * f.r;
      ctx.globalAlpha = f.a;
      if (f.ermine) {
        // Rocks gently from side to side as it drifts.
        const s = (2 * f.r) / 150;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(Math.sin(f.phase) * f.tilt);
        ctx.scale(s, s);
        ctx.translate(-50, -80);
        ctx.fill(ERMINE);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function update() {
    const shouldRun = visible && !document.hidden && !motion.matches;
    if (shouldRun && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!shouldRun && running) { running = false; cancelAnimationFrame(raf); }
    if (motion.matches) ctx.clearRect(0, 0, w, h);
  }

  resize();
  // Draw one frame straight away so the snow is there at first paint.
  frame(performance.now());
  cancelAnimationFrame(raf);

  new ResizeObserver(resize).observe(header);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); }).observe(header);
  }
  document.addEventListener("visibilitychange", update);
  motion.addEventListener?.("change", update);
  update();
})();
