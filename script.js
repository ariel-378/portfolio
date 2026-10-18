// Small page behaviors: scroll reveals, the typed terminal, the runaway
// portrait, and click sparks. Everything degrades cleanly if JavaScript is off.
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

  // ── Avatar dodge ──────────────────────────────────────────────────────────
  // The hero portrait refuses to be touched. When the mouse gets close it
  // detaches from the layout, flees across the viewport (over any section),
  // slides along the edges when cornered, and dashes to the far side if it
  // gets trapped. It springs home once the cursor backs off. Mouse-only;
  // skipped under reduced motion.
  const avatar = document.querySelector(".avatar");
  const SAFE_DISTANCE = 200;     // px between cursor and portrait centre it insists on
  const TRAPPED_DISTANCE = 110;  // px: closer than this after clamping means it is cornered
  const SPRING_STIFFNESS = 0.12;
  const SPRING_DAMPING = 0.72;
  const TILT_PER_PX = 0.5;       // deg of lean per px of horizontal speed
  const TILT_MAX = 16;
  const EDGE_MARGIN = 12;
  const REST_EPSILON = 0.15;
  const FLEEING_Z_INDEX = 60;
  const GLOW_DISTANCE = 600;     // px from home at which the outline is at full blaze
  const GLOW_MAX_BLUR = 40;      // px
  const RING_HUE_HOME = 263;     // violet
  const RING_HUE_FAR = 330;      // hot pink
  const RING_LIGHT_HOME = 58;    // %
  const RING_LIGHT_FAR = 86;     // %
  const canHover = window.matchMedia("(hover: hover)").matches;

  if (avatar && canHover && !REDUCED_MOTION) {
    const pos = { x: 0, y: 0 };     // offset from home, in px
    const vel = { x: 0, y: 0 };
    const cursor = { x: -9999, y: -9999, inside: false };
    const placeholder = document.createElement("div");
    let isDetached = false;
    let frame = null;

    function detach() {
      const box = avatar.getBoundingClientRect();
      placeholder.style.width = box.width + "px";
      placeholder.style.height = box.height + "px";
      avatar.parentNode.insertBefore(placeholder, avatar);
      avatar.style.position = "fixed";
      avatar.style.width = box.width + "px";
      avatar.style.margin = "0";
      avatar.style.zIndex = String(FLEEING_Z_INDEX);
      isDetached = true;
    }

    function reattach() {
      placeholder.remove();
      ["position", "width", "margin", "zIndex", "left", "top"].forEach(function (p) { avatar.style[p] = ""; });
      isDetached = false;
    }

    function homeBox() { return (isDetached ? placeholder : avatar).getBoundingClientRect(); }

    // Where the portrait wants to be this frame: clear of the cursor and on screen.
    function desiredOffset(home) {
      const centerX = home.left + home.width / 2 + pos.x;
      const centerY = home.top + home.height / 2 + pos.y;
      const awayX = centerX - cursor.x;
      const awayY = centerY - cursor.y;
      const distance = Math.hypot(awayX, awayY) || 1;
      if (!cursor.inside || distance > SAFE_DISTANCE) return { x: 0, y: 0, fleeing: false };
      const push = SAFE_DISTANCE - distance;
      return { x: pos.x + (awayX / distance) * push, y: pos.y + (awayY / distance) * push, fleeing: true };
    }

    function clampToViewport(offset, home) {
      const minX = EDGE_MARGIN - home.left;
      const maxX = window.innerWidth - EDGE_MARGIN - home.width - home.left;
      const minY = EDGE_MARGIN - home.top;
      const maxY = window.innerHeight - EDGE_MARGIN - home.height - home.top;
      return { x: Math.min(maxX, Math.max(minX, offset.x)), y: Math.min(maxY, Math.max(minY, offset.y)) };
    }

    // Cornered: jump to the spot on screen farthest from the cursor.
    function escapeHatch(home) {
      const farX = cursor.x < window.innerWidth / 2 ? window.innerWidth - EDGE_MARGIN - home.width : EDGE_MARGIN;
      const farY = cursor.y < window.innerHeight / 2 ? window.innerHeight - EDGE_MARGIN - home.height : EDGE_MARGIN;
      pos.x = farX - home.left; pos.y = farY - home.top;
      vel.x = 0; vel.y = 0;
    }

    function step() {
      const home = homeBox();
      const wanted = desiredOffset(home);
      const target = wanted.fleeing ? clampToViewport(wanted, home) : wanted;
      if (wanted.fleeing && !isDetached) detach();

      if (wanted.fleeing) {
        // Fleeing is instant so a fast cursor can never catch it; only the
        // return trip is springy.
        vel.x = (target.x - pos.x) * 0.6; vel.y = (target.y - pos.y) * 0.6;
        pos.x = target.x; pos.y = target.y;
        const cx = home.left + home.width / 2 + pos.x, cy = home.top + home.height / 2 + pos.y;
        if (Math.hypot(cx - cursor.x, cy - cursor.y) < TRAPPED_DISTANCE) escapeHatch(home);
      } else {
        vel.x = (vel.x + (target.x - pos.x) * SPRING_STIFFNESS) * SPRING_DAMPING;
        vel.y = (vel.y + (target.y - pos.y) * SPRING_STIFFNESS) * SPRING_DAMPING;
        pos.x += vel.x; pos.y += vel.y;
      }

      const tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, vel.x * TILT_PER_PX));
      if (isDetached) {
        avatar.style.left = (home.left + pos.x).toFixed(1) + "px";
        avatar.style.top = (home.top + pos.y).toFixed(1) + "px";
      }
      avatar.style.setProperty("--tilt", tilt.toFixed(1) + "deg");
      paintOutline(Math.hypot(pos.x, pos.y));

      const atRest = !wanted.fleeing
        && Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(pos.x) + Math.abs(pos.y) < REST_EPSILON;
      if (atRest) {
        pos.x = 0; pos.y = 0;
        if (isDetached) reattach();
        avatar.style.setProperty("--tilt", "0deg");
        frame = null;
        return;
      }
      frame = requestAnimationFrame(step);
    }

    // Outline brightness scales with distance from home: violet at rest,
    // blazing pink-white with a glow when it has run far.
    function paintOutline(distance) {
      const t = Math.min(1, distance / GLOW_DISTANCE);
      const hue = RING_HUE_HOME + (RING_HUE_FAR - RING_HUE_HOME) * t;
      const light = RING_LIGHT_HOME + (RING_LIGHT_FAR - RING_LIGHT_HOME) * t;
      avatar.style.setProperty("--ring", "hsl(" + hue.toFixed(0) + " 100% " + light.toFixed(0) + "%)");
      avatar.style.setProperty("--glow", (GLOW_MAX_BLUR * t).toFixed(0) + "px");
      avatar.style.setProperty("--glow-color", "hsl(" + hue.toFixed(0) + " 100% 70% / " + (0.9 * t).toFixed(2) + ")");
    }

    function wake() { if (frame === null) frame = requestAnimationFrame(step); }

    document.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse") return;
      cursor.x = event.clientX; cursor.y = event.clientY; cursor.inside = true;
      wake();
    });
    document.addEventListener("pointerleave", function () { cursor.inside = false; wake(); });
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
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
