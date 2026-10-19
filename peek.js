/* Peeking dogs: every so often one of Ariel’s dogs (Luna, Kona, or Tillie) pops
   out from behind a random card that is on screen, wobbles, and ducks back. The dog lives in a small
   clipped "window" placed against one edge of the card and rotated so the dog
   emerges sideways or from underneath when that is where the free space is.
   The window is inserted first inside the card's container, so neighbouring
   cards (all positioned, z-index auto) paint over it. */
(() => {
  "use strict";

  const FIRST_PEEK_MIN_MS = 2500;
  const FIRST_PEEK_MAX_MS = 5000;
  const GAP_MIN_MS = 7000;
  const GAP_MAX_MS = 16000;
  const HOLD_MIN_MS = 1500;
  const HOLD_MAX_MS = 2800;
  const UP_MS = 450;
  const WAG_MIN_MS = 800;        /* a quick tap still wags the tail this long */
  const LINGER_AFTER_TAP_MS = 1500; /* the dog waits this long after you let go before ducking */
  const DOG_WIDTH = 112;
  const DOG_HEIGHT = 86;
  const EDGE_INSET = 20;
  const VIEWPORT_MARGIN = 8;
  /* Anything the dog must not overlap while it is out. */
  const OBSTACLE_SELECTOR = ".card, .section__head, .hero, .footer, .timeline, .peek";

  /* Which way "up" points for the dog, per card edge it hides behind. */
  const EDGES = [
    { name: "top", rotate: 0 },
    { name: "bottom", rotate: 180 },
    { name: "left", rotate: -90 },
    { name: "right", rotate: 90 },
  ];

  /* Ariel's dogs. Luna is white all over; Kona and Tillie are white with
     black spots. Ears are [left, right]; spots are ellipses in the dog's own
     coordinate space, clipped to the head; paws are [left, right] black flags. */
  const WHITE = "#FFFFFF";
  const WHITE_SHADE = "#EFEDF5";
  const BLACK = "#1B1A2E";
  const DOGS = [
    { name: "Luna", ears: [WHITE_SHADE, WHITE_SHADE], spots: [], blackPaws: [false, false] },
    {
      name: "Kona",
      ears: [BLACK, WHITE_SHADE],
      spots: [{ cx: 70, cy: 40, rx: 13, ry: 12 }, { cx: 36, cy: 24, rx: 9, ry: 6 }],
      blackPaws: [false, true],
    },
    {
      name: "Tillie",
      ears: [WHITE_SHADE, BLACK],
      spots: [{ cx: 39, cy: 53, rx: 8, ry: 6 }, { cx: 60, cy: 19, rx: 8, ry: 5 }, { cx: 80, cy: 58, rx: 6, ry: 5 }],
      blackPaws: [true, false],
    },
  ];
  let dogCount = 0;

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

  function dogMarkup(dog) {
    const clipId = `peek-head-${++dogCount}`;
    const pawFill = (isBlack) => (isBlack ? BLACK : WHITE);
    const spots = dog.spots
      .map((s) => `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"/>`)
      .join("");
    return `<svg class="peek__dog" data-dog="${dog.name}" viewBox="0 0 112 86" width="${DOG_WIDTH}" height="${DOG_HEIGHT}" aria-hidden="true">
      <defs><clipPath id="${clipId}"><ellipse cx="56" cy="44" rx="34" ry="31"/></clipPath></defs>
      <path class="peek__tail" d="M78 66 Q92 56 94 38 Q96 26 103 23 Q109 28 104 42 Q100 60 86 70 Z" fill="${dog.ears[1]}" stroke="#14122B" stroke-width="2.5" stroke-linejoin="round"/>
      <g stroke="#14122B" stroke-width="2.5" stroke-linejoin="round">
        <ellipse cx="18" cy="44" rx="11" ry="20" fill="${dog.ears[0]}" transform="rotate(14 18 44)"/>
        <ellipse cx="94" cy="44" rx="11" ry="20" fill="${dog.ears[1]}" transform="rotate(-14 94 44)"/>
      </g>
      <ellipse cx="56" cy="44" rx="34" ry="31" fill="${WHITE}" stroke="#14122B" stroke-width="2.5"/>
      <g clip-path="url(#${clipId})" fill="${BLACK}">${spots}</g>
      <ellipse cx="56" cy="56" rx="17" ry="12" fill="#FBF6EE" stroke="#14122B" stroke-width="2"/>
      <circle cx="43" cy="39" r="6.5" fill="#fff"/>
      <circle cx="69" cy="39" r="6.5" fill="#fff"/>
      <circle cx="43" cy="39" r="4.5" fill="#14122B"/>
      <circle cx="69" cy="39" r="4.5" fill="#14122B"/>
      <circle cx="44.5" cy="37.5" r="1.5" fill="#fff"/>
      <circle cx="70.5" cy="37.5" r="1.5" fill="#fff"/>
      <ellipse cx="56" cy="51" rx="6" ry="4.5" fill="#14122B"/>
      <path d="M50 58 Q56 63 62 58" fill="none" stroke="#14122B" stroke-width="2" stroke-linecap="round"/>
      <path d="M52 60 Q56 70 60 60 Z" fill="#F43F8E" stroke="#14122B" stroke-width="1.5"/>
      <g stroke="#14122B" stroke-width="2.5" stroke-linejoin="round">
        <rect x="24" y="70" width="24" height="18" rx="9" fill="${pawFill(dog.blackPaws[0])}"/>
        <rect x="64" y="70" width="24" height="18" rx="9" fill="${pawFill(dog.blackPaws[1])}"/>
      </g>
      <g stroke="#14122B" stroke-width="2" stroke-linecap="round">
        <path d="M32 72 v6 M40 72 v6 M72 72 v6 M80 72 v6"/>
      </g>
    </svg>`;
  }

  /* The on-screen box the dog would occupy if it peeked from this edge, at a
     random position along the edge. Null when the edge is too short. */
  function dogBoxFor(rect, edge) {
    const alongX = rect.width - DOG_WIDTH - EDGE_INSET * 2;
    const alongY = rect.height - DOG_WIDTH - EDGE_INSET * 2;
    switch (edge.name) {
      case "top":
        return alongX < 0 ? null : box(rect.left + EDGE_INSET + randomBetween(0, alongX), rect.top - DOG_HEIGHT, DOG_WIDTH, DOG_HEIGHT);
      case "bottom":
        return alongX < 0 ? null : box(rect.left + EDGE_INSET + randomBetween(0, alongX), rect.bottom, DOG_WIDTH, DOG_HEIGHT);
      case "left":
        return alongY < 0 ? null : box(rect.left - DOG_HEIGHT, rect.top + EDGE_INSET + randomBetween(0, alongY), DOG_HEIGHT, DOG_WIDTH);
      case "right":
        return alongY < 0 ? null : box(rect.right, rect.top + EDGE_INSET + randomBetween(0, alongY), DOG_HEIGHT, DOG_WIDTH);
      default:
        return null;
    }
  }

  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const insideViewport = (b) =>
    b.left >= VIEWPORT_MARGIN &&
    b.top >= VIEWPORT_MARGIN &&
    b.right <= window.innerWidth - VIEWPORT_MARGIN &&
    b.bottom <= window.innerHeight - VIEWPORT_MARGIN;

  /* Every (card, edge) pair where the dog would be fully on screen and not
     covering any other card, heading, or section. */
  function openSpots() {
    const obstacles = Array.from(document.querySelectorAll(OBSTACLE_SELECTOR)).map((el) => ({
      el,
      rect: el.getBoundingClientRect(),
    }));
    const spots = [];
    for (const { el: card, rect } of obstacles) {
      if (!card.classList.contains("card")) continue;
      for (const edge of EDGES) {
        const dogBox = dogBoxFor(rect, edge);
        if (!dogBox || !insideViewport(dogBox)) continue;
        const blocked = obstacles.some((o) => o.el !== card && overlaps(dogBox, o.rect));
        if (!blocked) spots.push({ card, edge, dogBox });
      }
    }
    return spots;
  }

  function peekAt({ card, edge, dogBox }) {
    const container = card.parentElement;
    const containerRect = container.getBoundingClientRect();
    const centerX = dogBox.left + dogBox.width / 2 - containerRect.left;
    const centerY = dogBox.top + dogBox.height / 2 - containerRect.top;

    const window_ = document.createElement("div");
    window_.className = "peek";
    window_.style.left = `${Math.round(centerX - DOG_WIDTH / 2)}px`;
    window_.style.top = `${Math.round(centerY - DOG_HEIGHT / 2)}px`;
    window_.style.rotate = `${edge.rotate}deg`;
    window_.innerHTML = dogMarkup(pickRandom(DOGS));
    container.insertBefore(window_, container.firstChild);

    const dog = window_.firstElementChild;
    dog.classList.add("peek__dog--up");
    const duckDown = () => {
      dog.classList.remove("peek__dog--up");
      dog.classList.add("peek__dog--down");
      dog.addEventListener("animationend", () => window_.remove(), { once: true });
    };
    let duckTimer = setTimeout(duckDown, UP_MS + randomBetween(HOLD_MIN_MS, HOLD_MAX_MS));

    /* Press the dog and its tail wags for as long as you hold, and never for
       less than a moment; it stays up a little after you let go. */
    let pressedAt = 0;
    let wagTimer = null;
    dog.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      clearTimeout(duckTimer);
      clearTimeout(wagTimer);
      pressedAt = performance.now();
      dog.classList.add("peek__dog--wag");
    });
    const release = () => {
      if (!dog.classList.contains("peek__dog--wag")) return;
      const remaining = Math.max(0, WAG_MIN_MS - (performance.now() - pressedAt));
      clearTimeout(wagTimer);
      wagTimer = setTimeout(() => dog.classList.remove("peek__dog--wag"), remaining);
      clearTimeout(duckTimer);
      duckTimer = setTimeout(duckDown, remaining + LINGER_AFTER_TAP_MS);
    };
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => dog.addEventListener(type, release));
  }

  function tick() {
    if (!document.hidden) {
      const spots = openSpots();
      if (spots.length) peekAt(pickRandom(spots));
    }
    setTimeout(tick, randomBetween(GAP_MIN_MS, GAP_MAX_MS));
  }

  setTimeout(tick, randomBetween(FIRST_PEEK_MIN_MS, FIRST_PEEK_MAX_MS));
})();
