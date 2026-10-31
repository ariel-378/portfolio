// Intro splash: the monogram assembles from building blocks, holds, then comes
// apart and scatters to reveal the page underneath. About a second and a
// half in all. Plays once per browser session; skipped under reduced motion,
// on small screens and when the browser asks to save data; any click or key
// skips it.
//
// The overlay is shown by CSS from the first paint; this script, loaded with
// defer, removes it at once when it should not play, and a <noscript> rule
// hides it when JavaScript is off. While it runs, <body> carries .has-splash,
// which holds the hero's load-in animations; "splash-done" fires on document
// when it ends.
(function () {
  "use strict";

  const SEEN_KEY = "splash-seen";
  const COLORS = ["pink", "violet", "cyan", "lime", "yellow"];
  const PATTERN = [
    ".###.",
    "#...#",
    "#...#",
    "#####",
    "#...#",
    "#...#",
    "#...#"
  ];
  const BUILD_STEP_MS = 25;   // gap between one block landing and the next
  const BUILD_MS = 420;       // one block's drop-in
  const HOLD_MS = 300;        // finished monogram on screen
  const BREAK_MS = 500;       // scatter, including the staggered delays
  const FADE_MS = 250;        // overlay fade; matches the .splash transition
  const MIN_VIEWPORT_PX = 600; // phones go straight to the page

  const splash = document.getElementById("splash");
  const grid = document.getElementById("splash-grid");
  if (!splash || !grid) return;

  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSmallScreen = window.innerWidth < MIN_VIEWPORT_PX;
  const wantsSavedData = Boolean(navigator.connection && navigator.connection.saveData);
  let hasSeen = false;
  try { hasSeen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch (e) { hasSeen = false; }
  if (isReducedMotion || isSmallScreen || wantsSavedData || hasSeen) { splash.remove(); return; }
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (e) { /* storage blocked: play every time */ }

  // ── Build the blocks, bottom row first, like stacking real ones ─────────
  const cells = [];
  PATTERN.forEach(function (row, y) {
    row.split("").forEach(function (ch, x) {
      if (ch === "#") cells.push({ x: x, y: y });
    });
  });
  cells.sort(function (a, b) { return b.y - a.y || a.x - b.x; });

  const centerX = (PATTERN[0].length - 1) / 2;
  const centerY = (PATTERN.length - 1) / 2;

  cells.forEach(function (cell, i) {
    const block = document.createElement("span");
    block.className = "blk blk--" + COLORS[(cell.x + cell.y) % COLORS.length];
    block.style.gridColumn = String(cell.x + 1);
    block.style.gridRow = String(cell.y + 1);

    // Fly outward from the centre, with some scatter so it looks like a break
    // rather than an explosion diagram.
    const angle = Math.atan2(cell.y - centerY, cell.x - centerX) + (Math.random() - 0.5) * 0.9;
    const distance = 320 + Math.random() * 260;
    block.style.setProperty("--dx", (Math.cos(angle) * distance).toFixed(0) + "px");
    block.style.setProperty("--dy", (Math.sin(angle) * distance + 120).toFixed(0) + "px");
    block.style.setProperty("--rot", (Math.random() * 260 - 130).toFixed(0) + "deg");
    block.style.setProperty("--in-delay", (i * BUILD_STEP_MS) + "ms");
    block.style.setProperty("--out-delay", Math.round(Math.random() * 280) + "ms");
    grid.appendChild(block);
  });

  // ── Run the sequence ────────────────────────────────────────────────────
  document.body.classList.add("has-splash");
  splash.classList.add("is-building");

  let isDone = false;
  function finish() {
    if (isDone) return;
    isDone = true;
    splash.classList.add("is-done");
    document.body.classList.remove("has-splash");
    document.dispatchEvent(new CustomEvent("splash-done"));
    setTimeout(function () { splash.remove(); }, FADE_MS);
  }

  const buildTotal = cells.length * BUILD_STEP_MS + BUILD_MS;
  const breakAt = setTimeout(function () { splash.classList.add("is-breaking"); }, buildTotal + HOLD_MS);
  const finishAt = setTimeout(finish, buildTotal + HOLD_MS + BREAK_MS);

  function skip() {
    clearTimeout(breakAt);
    clearTimeout(finishAt);
    finish();
  }
  splash.addEventListener("click", skip);
  document.addEventListener("keydown", skip, { once: true });
})();
