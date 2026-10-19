/* Shooting stars: every second or so a star streaks across a thin strip at
   the very top of the hero, above the heading, on a canvas behind the copy.
   Pressing Space makes every star on screen hop into the air and launches a
   fresh volley. The streak behind each star is its actual recent path, so it
   bends through the arc of a hop. Skipped under reduced motion; paused while
   the hero is off screen or the tab is hidden. */
(() => {
  "use strict";

  const BAND_HEIGHT = 110;          // px: stars keep to this strip at the top of the hero
  const SPAWN_MIN_MS = 700;
  const SPAWN_MAX_MS = 1900;
  const SPEED_MIN = 220;            // px per second along the streak
  const SPEED_MAX = 400;
  const SLOPE = 0.04;               // vertical drop per horizontal px of travel: nearly flat, so a star stays in the strip all the way across
  const TAIL_MIN = 90;              // px of path the streak covers
  const TAIL_MAX = 190;
  const TAIL_WIDTH_MIN = 1.8;       // px, the streak at its brightest end
  const TAIL_WIDTH_MAX = 3.1;
  const HEAD_MIN = 5;               // px radius of the four-point star at the front
  const HEAD_MAX = 9;
  const JUMP_VELOCITY = 540;        // px per second, upward, when Space is pressed
  const GRAVITY = 1500;             // px per second squared, pulls a hopping star back to its slope
  const JUMP_VOLLEY = 5;            // extra stars launched per press, within MAX_STARS
  const MAX_AMBIENT_STARS = 3;      // no new star drifts in while this many are on screen
  const MAX_STARS = 6;              // hard cap, hops included
  const TRAIL_SPACING = 4;          // px between remembered points along the path
  const MAX_FRAME_S = 0.05;         // clamp a stalled tab's catch-up frame
  const COLOR_TOKENS = ["--pink", "--cyan", "--violet", "--yellow", "--lime"];
  const EDITABLE = "input, textarea, select, [contenteditable]";

  const hero = document.querySelector(".hero");
  const canvas = hero && hero.querySelector(".stars");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!hero || !canvas || reducedMotion) {
    if (canvas) canvas.remove();
    return;
  }

  const ctx = canvas.getContext("2d");
  const rootStyle = getComputedStyle(document.documentElement);
  const colors = COLOR_TOKENS.map((t) => rootStyle.getPropertyValue(t).trim()).filter(Boolean);

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  let width = 0, height = 0;
  let stars = [];
  let nextSpawnAt = 0;
  let lastFrame = null;
  let frame = null;
  let isVisible = true;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = hero.clientWidth; height = hero.clientHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Points back along a straight line from (x, y), so a new star arrives
  // with a full streak instead of growing one.
  function straightTrail(x, y, vx, vy, tail) {
    const len = Math.hypot(vx, vy) || 1;
    const count = Math.ceil(tail / TRAIL_SPACING);
    return Array.from({ length: count }, (_, i) => ({
      x: x - (vx / len) * TRAIL_SPACING * (i + 1),
      y: y - (vy / len) * TRAIL_SPACING * (i + 1),
    }));
  }

  // A star enters from the top edge or the left and glides along the strip.
  function makeStar() {
    const speed = rand(SPEED_MIN, SPEED_MAX);
    const vx = speed / Math.hypot(1, SLOPE);
    const vy = vx * SLOPE;
    const fromTop = Math.random() < 0.5;
    const x = fromTop ? rand(-0.1 * width, 0.8 * width) : -TAIL_MAX;
    const y = fromTop ? -6 : rand(6, BAND_HEIGHT * 0.5);
    const tail = rand(TAIL_MIN, TAIL_MAX);
    return {
      x: x, y: y, vx: vx, vy: vy, baseVy: vy,
      lineX: x, lineY: y, isHopping: false,   // the glide line a hop leaves and lands back on
      tail: tail, tailWidth: rand(TAIL_WIDTH_MIN, TAIL_WIDTH_MAX), head: rand(HEAD_MIN, HEAD_MAX),
      color: pick(colors),
      trail: straightTrail(x, y, vx, vy, tail),   // recent positions, nearest first
    };
  }

  // Remember the path: add the old position once the star has moved far
  // enough from the last point, and drop points beyond the streak's length.
  function extendTrail(star, x, y) {
    const last = star.trail[0];
    const far = !last || Math.hypot(star.x - last.x, star.y - last.y) >= TRAIL_SPACING;
    const trail = far ? [{ x: star.x, y: star.y }].concat(star.trail) : star.trail;
    let covered = Math.hypot(x - trail[0].x, y - trail[0].y);
    let keep = 1;
    while (keep < trail.length && covered < star.tail) {
      covered += Math.hypot(trail[keep].x - trail[keep - 1].x, trail[keep].y - trail[keep - 1].y);
      keep += 1;
    }
    return trail.slice(0, keep);
  }

  // A hopping star rises, falls under gravity and lands back on its glide
  // line, where it picks up its straight flight again.
  function advance(star, dt) {
    const x = star.x + star.vx * dt;
    const lineY = star.lineY + SLOPE * (x - star.lineX);
    if (!star.isHopping) return { ...star, x: x, y: lineY, trail: extendTrail(star, x, lineY) };
    const vy = star.vy + GRAVITY * dt;
    const y = star.y + vy * dt;
    const landed = y >= lineY;
    return {
      ...star, x: x, y: landed ? lineY : y, vy: landed ? star.baseVy : vy, isHopping: !landed,
      trail: extendTrail(star, x, landed ? lineY : y),
    };
  }

  // A star lives until its whole streak has crossed the right edge.
  function isOnScreen(star) {
    return star.x - star.tail < width;
  }

  // The streak follows the remembered path, thinning and fading toward the end.
  function drawTail(star) {
    const points = [{ x: star.x, y: star.y }].concat(star.trail);
    const total = points.length - 1;
    ctx.strokeStyle = star.color; ctx.lineCap = "round";
    for (let i = 0; i < total; i += 1) {
      const fade = 1 - i / total;
      ctx.globalAlpha = fade;
      ctx.lineWidth = star.tailWidth * (0.25 + 0.75 * fade);
      ctx.beginPath(); ctx.moveTo(points[i].x, points[i].y); ctx.lineTo(points[i + 1].x, points[i + 1].y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
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

  function draw(star) {
    drawTail(star);
    ctx.shadowColor = star.color; ctx.shadowBlur = 14;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = star.color; ctx.lineWidth = 1.2; ctx.lineJoin = "round";
    sparklePath(star.x, star.y, star.head);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function step(now) {
    const dt = lastFrame === null ? 0 : Math.min(MAX_FRAME_S, (now - lastFrame) / 1000);
    lastFrame = now;
    if (now >= nextSpawnAt) {
      if (stars.length < MAX_AMBIENT_STARS) stars = stars.concat([makeStar()]);
      nextSpawnAt = now + rand(SPAWN_MIN_MS, SPAWN_MAX_MS);
    }
    stars = stars.map((s) => advance(s, dt)).filter(isOnScreen);
    ctx.clearRect(0, 0, width, height);
    stars.forEach(draw);
    frame = isVisible ? requestAnimationFrame(step) : null;
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

  // Space: every star hops, a volley of new ones joins in. The page keeps its
  // scroll-on-space behaviour once the hero has left the screen, and typing
  // into the terminal (or any field) is never hijacked.
  function jump() {
    const room = Math.max(0, Math.min(JUMP_VOLLEY, MAX_STARS - stars.length));
    stars = stars.map((s) => ({ ...s, vy: (s.isHopping ? s.vy : s.baseVy) - JUMP_VELOCITY, isHopping: true }))
      .concat(Array.from({ length: room }, makeStar));
    start();
  }

  function heroIsInView() {
    const box = hero.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight * 0.5;
  }

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat) return;
    if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
    if (!heroIsInView()) return;
    event.preventDefault();
    jump();
  });

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
  start();
})();
