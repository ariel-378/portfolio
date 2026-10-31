// Small page behaviors: scroll reveals, the typed terminal, the portrait
// that looks at the cursor, and click sparks. Everything degrades cleanly if JavaScript is off.
(function () {
  "use strict";

  const REVEAL_STAGGER_MS = 70;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Scroll reveal ─────────────────────────────────────────────────────────
  // Elements marked data-reveal fade up once when they enter the viewport.
  // Siblings revealed in the same frame are staggered so grids ripple in.
  const revealables = Array.from(document.querySelectorAll("[data-reveal]"));

  if (REDUCED_MOTION || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    const observer = new IntersectionObserver(function (entries) {
      const entering = entries.filter(function (e) { return e.isIntersecting; });
      entering.forEach(function (entry, i) {
        const el = entry.target;
        el.style.transitionDelay = (i * REVEAL_STAGGER_MS) + "ms";
        el.classList.add("is-visible");
        observer.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
    revealables.forEach(function (el) { observer.observe(el); });
  }

  // ── Terminal typing ───────────────────────────────────────────────────────
  // The hero terminal types each command, then prints its output. Without
  // JavaScript, or under reduced motion, the finished transcript just shows.
  const TYPE_MS = 40;
  const PAUSE_AFTER_CMD_MS = 240;
  const PAUSE_AFTER_OUT_MS = 380;
  const terminal = document.getElementById("terminal-lines");

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function typeInto(el, text, cursor) {
    el.textContent = "";
    el.appendChild(cursor);
    for (const ch of text) {
      el.insertBefore(document.createTextNode(ch), cursor);
      await wait(TYPE_MS);
    }
  }

  async function playTerminal() {
    const lines = Array.from(terminal.querySelectorAll(".t-line"));
    const cursor = terminal.querySelector(".t-cursor");
    terminal.classList.add("is-typing");
    for (const line of lines) {
      const cmd = line.querySelector(".t-cmd");
      line.classList.add("is-shown");
      if (cmd) {
        await typeInto(cmd, cmd.textContent, cursor);
        await wait(PAUSE_AFTER_CMD_MS);
      } else if (!line.contains(cursor)) {
        await wait(PAUSE_AFTER_OUT_MS);
      }
    }
    // Park the cursor back on the final prompt line.
    lines[lines.length - 1].appendChild(cursor);
    terminalReady();
  }

  // shell.js takes over the prompt once the intro transcript is finished.
  function terminalReady() {
    if (!terminal) return;
    terminal.dataset.ready = "1";
    document.dispatchEvent(new CustomEvent("terminal-ready"));
  }

  // Wait for the intro splash, if one is running, so the typing isn't missed.
  if (terminal && !REDUCED_MOTION) {
    if (document.body.classList.contains("has-splash")) {
      document.addEventListener("splash-done", playTerminal, { once: true });
    } else {
      playTerminal();
    }
  } else {
    terminalReady();
  }

  // ── Portrait that looks at the cursor ─────────────────────────────────────
  // The hero portrait stays put. While the mouse is on the page it swaps to
  // whichever of the directional photos faces the cursor, with a little
  // hysteresis so the eyes do not flicker on a boundary. The photos come from
  // data-look-* on the headshot <img> and are mounted once the page has
  // loaded, so they never compete with the first paint. Mouse-only; skipped
  // under reduced motion.
  const avatar = document.querySelector(".avatar");
  const LOOK_DIRECTIONS = [     // the photos she can swap to, as screen angles (0 = right, 90 = up)
    { name: "right", angle: 0 }, { name: "up-right", angle: 45 }, { name: "up", angle: 90 },
    { name: "up-left", angle: 135 }, { name: "left", angle: 180 }, { name: "down-left", angle: 225 },
    { name: "down", angle: 270 }, { name: "down-right", angle: 315 },
  ];
  const LOOK_HYSTERESIS_DEG = 12; // a neighbouring photo must fit this much better before the eyes move
  const canHover = window.matchMedia("(hover: hover)").matches;

  if (avatar && canHover && !REDUCED_MOTION) {
    const cursor = { x: 0, y: 0, inside: false };
    let lookFrames = [];
    let looking = null;             // the directional photo on show, or null for the straight-on one
    let center = null;              // the portrait's centre in viewport px, measured once per scroll/resize
    let frame = null;

    // Each directional photo is stacked over the headshot, hidden, so
    // switching is a class flip with no reload. A direction with no photo
    // (down-left) borrows its nearest.
    function mountLookFrames(img) {
      if (!img) return [];
      return LOOK_DIRECTIONS
        .map(function (dir) { return { dir: dir, src: img.dataset["look" + pascalCase(dir.name)] }; })
        .filter(function (f) { return Boolean(f.src); })
        .map(function (f) {
          const el = document.createElement("img");
          el.className = "pic pic--avatar pic--look";
          el.src = f.src; el.alt = "";
          el.setAttribute("width", img.getAttribute("width")); el.setAttribute("height", img.getAttribute("height"));
          el.setAttribute("aria-hidden", "true");
          img.parentNode.appendChild(el);
          return { name: f.dir.name, angle: f.dir.angle, el: el };
        });
    }

    function pascalCase(name) {
      return name.split("-").map(function (p) { return p[0].toUpperCase() + p.slice(1); }).join("");
    }

    function angularDistance(a, b) {
      const d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    }

    // The photo that best faces `angle`. The current one is kept unless a
    // neighbour is clearly better, so the eyes do not flicker on a boundary.
    function pickLookFrame(angle, current) {
      const best = lookFrames.reduce(function (acc, f) {
        return angularDistance(f.angle, angle) < angularDistance(acc.angle, angle) ? f : acc;
      });
      const keepCurrent = current
        && angularDistance(current.angle, angle) <= angularDistance(best.angle, angle) + LOOK_HYSTERESIS_DEG;
      return keepCurrent ? current : best;
    }

    function showLook(next) {
      if (next === looking) return;
      if (looking) looking.el.classList.remove("is-looking");
      if (next) next.el.classList.add("is-looking");
      looking = next;
    }

    function measure() {
      const box = avatar.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }

    // One update per animation frame, however many pointer events arrive.
    function update() {
      frame = null;
      if (lookFrames.length === 0) return;
      if (!cursor.inside) { showLook(null); return; }
      if (center === null) center = measure();
      const angle = (Math.atan2(center.y - cursor.y, cursor.x - center.x) * 180 / Math.PI + 360) % 360;
      showLook(pickLookFrame(angle, looking));
    }

    function scheduleUpdate() { if (frame === null) frame = requestAnimationFrame(update); }
    function remeasure() { center = null; scheduleUpdate(); }

    function mount() {
      lookFrames = mountLookFrames(avatar.querySelector(".pic--avatar"));
      scheduleUpdate();
    }

    document.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse") return;
      cursor.x = event.clientX; cursor.y = event.clientY; cursor.inside = true;
      scheduleUpdate();
    });
    document.addEventListener("pointerleave", function () { cursor.inside = false; scheduleUpdate(); });
    window.addEventListener("scroll", remeasure, { passive: true });
    window.addEventListener("resize", remeasure);
    if (document.readyState === "complete") mount();
    else window.addEventListener("load", mount, { once: true });
  }

  // ── Click sparks ──────────────────────────────────────────────────────────
  // Every button (and button-style link) throws a burst of sparks from the
  // spot that was clicked. Skipped under reduced motion.
  const SPARK_TARGETS = ".btn, button, .link-arrow, .more summary";
  const SPARK_COUNT = 24;
  const SPARK_COLORS = ["--pink", "--violet", "--cyan", "--yellow", "--lime"];
  const SPARK_MIN_DISTANCE = 40;
  const SPARK_MAX_DISTANCE = 130;
  const SPARK_MIN_SIZE = 7;
  const SPARK_MAX_SIZE = 16;

  function sparkOrigin(event, target) {
    const isKeyboard = event.detail === 0 || (event.clientX === 0 && event.clientY === 0);
    if (!isKeyboard) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  function makeSpark(origin, index) {
    const spark = document.createElement("span");
    const angle = (Math.PI * 2 * index) / SPARK_COUNT + Math.random() * 0.6;
    const distance = SPARK_MIN_DISTANCE + Math.random() * (SPARK_MAX_DISTANCE - SPARK_MIN_DISTANCE);
    const size = SPARK_MIN_SIZE + Math.random() * (SPARK_MAX_SIZE - SPARK_MIN_SIZE);
    const color = SPARK_COLORS[index % SPARK_COLORS.length];
    spark.className = "spark";
    spark.style.left = origin.x + "px";
    spark.style.top = origin.y + "px";
    spark.style.width = spark.style.height = size.toFixed(1) + "px";
    spark.style.background = "var(" + color + ")";
    spark.style.setProperty("--dx", (Math.cos(angle) * distance).toFixed(0) + "px");
    spark.style.setProperty("--dy", (Math.sin(angle) * distance).toFixed(0) + "px");
    spark.style.setProperty("--spin", (Math.random() * 360).toFixed(0) + "deg");
    spark.addEventListener("animationend", function () { spark.remove(); });
    return spark;
  }

  function emitSparks(origin) {
    const burst = document.createDocumentFragment();
    for (let i = 0; i < SPARK_COUNT; i += 1) burst.appendChild(makeSpark(origin, i));
    document.body.appendChild(burst);
  }

  if (!REDUCED_MOTION) {
    document.addEventListener("click", function (event) {
      const target = event.target.closest(SPARK_TARGETS);
      if (target) emitSparks(sparkOrigin(event, target));
    });
  }
})();
