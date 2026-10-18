// Small page behaviors: the mobile nav, scroll reveals, and the active nav
// link. Everything degrades cleanly if JavaScript is off.
(function () {
  "use strict";

  const REVEAL_STAGGER_MS = 70;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Mobile nav ────────────────────────────────────────────────────────────
  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");

  function setMenu(isOpen) {
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    menu.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("nav-open", isOpen);
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
  }

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
  }

  // Wait for the intro splash, if one is running, so the typing isn't missed.
  if (terminal && !REDUCED_MOTION) {
    if (document.body.classList.contains("has-splash")) {
      document.addEventListener("splash-done", playTerminal, { once: true });
    } else {
      playTerminal();
    }
  }

  // ── Active nav link ───────────────────────────────────────────────────────
  const links = Array.from(document.querySelectorAll(".nav__menu a[href^='#']"));
  const sections = links
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    const spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        const id = "#" + entry.target.id;
        links.forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === id);
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
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
