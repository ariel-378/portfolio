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
})();
