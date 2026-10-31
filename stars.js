/* Stars: a scattering of small sparkles sits in a thin strip at the top of
   the hero, above the heading, on a canvas behind the copy. Each one twinkles
   gently on its own. Hold Space and every star shines brighter the longer the
   key is held, then settles back once it is released. Typing in the terminal
   (or any field) never triggers it. Twinkling is skipped under reduced
   motion; narrow screens get fewer stars at 30 fps; the loop pauses while
   the hero is off screen or the tab is hidden. */
(() => {
  "use strict";

  const BAND_HEIGHT = 110;          // px: stars keep to this strip at the top of the hero
  const PX_PER_STAR = 80;           // one star per this many px of hero width...
  const MIN_STARS = 8;              // ...within these bounds
  const MAX_STARS = 24;
  const EDGE_INSET = 10;            // px: keep a star's glow inside the strip
  const HEAD_MIN = 3;               // px radius of a four-point star at rest
  const HEAD_MAX = 6.5;
  const CHARGE_UP_S = 2.5;          // seconds of holding Space to reach full shine
  const CHARGE_DOWN_S = 1.2;        // seconds to fade back after letting go
  const TWINKLE_MIN_HZ = 0.2;       // each star's own slow pulse
  const TWINKLE_MAX_HZ = 0.55;
  const REST_ALPHA = 0.55;          // brightness at rest; the pulse swings around it
  const TWINKLE_DEPTH = 0.25;
  const GLOW_REST = 8;              // px of blur behind a star at rest...
  const GLOW_FULL = 40;             // ...and at full shine
  const SCALE_FULL = 1.8;           // a star grows to this many times its size at full shine
  const HALO_FULL = 5;              // soft halo radius, in star radii, at full shine
  const HALO_ALPHA = 0.55;
  const MAX_FRAME_S = 0.05;         // clamp a stalled tab's catch-up frame
  const NARROW_PX = 900;            // below this width: half the stars, 30 fps
  const NARROW_FRAME_MS = 1000 / 30;
  const SHINE_KEY = "KeyS";         // S: free by default, unlike Space, which scrolls
  const COLOR_TOKENS = ["--pink", "--cyan", "--violet", "--yellow", "--lime"];
  const EDITABLE = "input, textarea, select, [contenteditable]";

  const hero = document.querySelector(".hero");
  const canvas = hero && hero.querySelector(".stars");
  if (!hero || !canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d");
  const rootStyle = getComputedStyle(document.documentElement);
  const colors = COLOR_TOKENS.map((t) => rootStyle.getPropertyValue(t).trim()).filter(Boolean);

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  let width = 0, height = 0;
  let isNarrow = false;
  let stars = [];
  let charge = 0;                   // 0 at rest, 1 at full shine
  let isHeld = false;
  let lastFrame = null;
  let frame = null;
  let isVisible = true;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = hero.clientWidth; height = hero.clientHeight;
    isNarrow = width < NARROW_PX;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Stars sit on a jittered grid across the strip so they spread out instead
  // of clumping. x is a fraction of the hero width, so a resize keeps the layout.
  function makeStars() {
    const perPx = isNarrow ? PX_PER_STAR * 2 : PX_PER_STAR;
    const count = clamp(Math.round(width / perPx), MIN_STARS, MAX_STARS);
    return Array.from({ length: count }, (_, i) => ({
      fx: (i + rand(0.15, 0.85)) / count,
      y: rand(EDGE_INSET, BAND_HEIGHT - EDGE_INSET),
      head: rand(HEAD_MIN, HEAD_MAX),
      hz: rand(TWINKLE_MIN_HZ, TWINKLE_MAX_HZ),
      phase: rand(0, Math.PI * 2),
      color: pick(colors),
    }));
  }

  // Charge climbs while Space is held and drains once it is released.
  function advanceCharge(current, dt) {
    const rate = isHeld ? dt / CHARGE_UP_S : -dt / CHARGE_DOWN_S;
    return clamp(current + rate, 0, 1);
  }

  // A four-point sparkle: long points up/down/left/right, pinched waist between.
  function sparklePath(cx, cy, r) {
    const waist = r * 0.32;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const radius = i % 2 === 0 ? r : waist;
      const px = cx + Math.cos(angle) * radius, py = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // The soft halo that blooms around a star as it charges up.
  function drawHalo(x, y, radius, color, shine) {
    const haloRadius = radius * HALO_FULL * shine;
    if (haloRadius <= 0) return;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, haloRadius);
    halo.addColorStop(0, color); halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = HALO_ALPHA * shine;
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, haloRadius, 0, Math.PI * 2); ctx.fill();
  }

  // At rest a star pulses around REST_ALPHA; as the shine builds, the pulse
  // gives way to full brightness, a bigger body, a stronger glow and a halo.
  function draw(star, seconds, shine) {
    const x = star.fx * width;
    const pulse = reducedMotion ? 0 : Math.sin(seconds * Math.PI * 2 * star.hz + star.phase) * TWINKLE_DEPTH;
    const alpha = clamp((REST_ALPHA + pulse) * (1 - shine) + shine, 0, 1);
    const radius = star.head * (1 + (SCALE_FULL - 1) * shine);
    drawHalo(x, star.y, radius, star.color, shine);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = star.color; ctx.shadowBlur = GLOW_REST + (GLOW_FULL - GLOW_REST) * shine;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = star.color; ctx.lineWidth = 1.2; ctx.lineJoin = "round";
    sparklePath(x, star.y, radius);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  function step(now) {
    if (isNarrow && lastFrame !== null && now - lastFrame < NARROW_FRAME_MS) {
      frame = requestAnimationFrame(step);
      return;
    }
    const dt = lastFrame === null ? 0 : Math.min(MAX_FRAME_S, (now - lastFrame) / 1000);
    lastFrame = now;
    charge = advanceCharge(charge, dt);
    const shine = easeOut(charge);
    ctx.clearRect(0, 0, width, height);
    stars.forEach((star) => draw(star, now / 1000, shine));
    // Under reduced motion nothing changes between frames once the shine has
    // settled, so the loop rests until the next key press.
    const isIdle = reducedMotion && !isHeld && charge === 0;
    frame = isVisible && !isIdle ? requestAnimationFrame(step) : null;
  }

  function start() {
    if (frame !== null || !isVisible) return;
    lastFrame = null;
    frame = requestAnimationFrame(step);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function heroIsInView() {
    const box = hero.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight * 0.5;
  }

  // S: hold to brighten. Only while the hero is on screen, and never while
  // typing into the terminal (or any field). Space is left alone so keyboard
  // users can still scroll with it.
  document.addEventListener("keydown", (event) => {
    if (event.code !== SHINE_KEY || event.repeat) return;
    if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
    if (!heroIsInView()) return;
    isHeld = true;
    start();
  });
  const release = () => { isHeld = false; start(); };
  document.addEventListener("keyup", (event) => { if (event.code === SHINE_KEY) release(); });
  window.addEventListener("blur", release);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      isVisible = entries.some((e) => e.isIntersecting) && !document.hidden;
      if (isVisible) start(); else stop();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", () => {
    isVisible = !document.hidden && heroIsInView();
    if (isVisible) start(); else stop();
  });
  window.addEventListener("resize", resize);

  resize();
  stars = makeStars();
  start();
})();
