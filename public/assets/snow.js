// Light snowfall behind the header text.
// - Off for readers who've asked for reduced motion
// - Pauses when the header is off-screen or the tab is hidden
// - To turn it off for good, delete the <script src="/assets/snow.js"> line in index.html
(() => {
  const header = document.querySelector(".masthead");
  if (!header || !window.HTMLCanvasElement) return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) return;

  const DENSITY = 0.00012;   // flakes per square pixel of header (about 120 on a laptop)
  const MAX_FLAKES = 180;

  const canvas = document.createElement("canvas");
  canvas.className = "snow";
  canvas.setAttribute("aria-hidden", "true");
  header.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let w = 0, h = 0, dpr = 1, flakes = [], running = false, visible = true, last = 0, raf = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  function makeFlake(anywhere) {
    const r = rand(1.2, 3.6);                       // bigger flakes fall faster: a little depth
    return {
      x: rand(0, w), y: anywhere ? rand(0, h) : rand(-20, -4),
      r, vy: 8 + r * 8, drift: rand(6, 16), phase: rand(0, Math.PI * 2), sway: rand(0.4, 1.1),
      a: rand(0.6, 0.95),
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
      if (f.x < -5) f.x = w + 5; else if (f.x > w + 5) f.x = -5;
      ctx.globalAlpha = f.a;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
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
