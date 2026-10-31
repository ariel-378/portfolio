# Portfolio

A one-page personal portfolio. Plain HTML, CSS and JavaScript — no build step.

## Run it

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static host works (GitHub Pages, Netlify drop).

## Fill it in

Every section ships with placeholder copy and dashed placeholder image boxes.

- **Text** — search `index.html` for "Placeholder" and replace as you go.
- **Portrait** — the hero headshot is `images/ariel-normal.jpg`. While the cursor
  chases it, the portrait swaps to the photo facing the cursor, taken from the
  `data-look-*` attributes on that `<img>` (`up`, `down`, `left`, `right`,
  `up-left`, `up-right`, `down-left`, `down-right`, all 640×640). Any direction
  without a photo borrows its nearest neighbour.
- **Images** — each placeholder is a `<div class="ph ph--16x9">` (or `--square`,
  `--portrait`, `--circle`, `--wide`). Swap the whole `div` for
  `<img class="pic ph--16x9" src="images/project.png" alt="…">`: `pic` styles
  a real image and the `ph--*` class keeps the slot's shape. Add `pic--logo`
  for a logo or seal so it is fitted rather than cropped. Files live in
  `images/`.
- **Sections** — each is a `<section id="…">`; the nav links match the ids.
- **Colors and fonts** — tokens at the top of `styles.css`.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page: hero, experience, projects, courses, publications, leadership, volunteer, fun facts, contact |
| `styles.css` | All styles; design tokens in `:root`; mobile layout at the bottom |
| `script.js` | Scroll-reveal, terminal typing, the avatar that dodges the cursor (and looks back at it while it runs), click sparks |
| `peek.js` | One of Ariel’s dogs (Luna, Kona, Tillie) pops up from behind a random on-screen card every few seconds; timings and coat colours are constants at the top |
| `shell.js` | The hero terminal accepts typed commands (`help`, `print()`, math) |
| `writing/` | One page per Woodley Leaves op-ed, plus `index.html` listing them and `writing.css` for the reading layout. The home-page publication titles link here |
| `stars.js` | Stars twinkle across the top of the hero; hold Space and they shine brighter the longer it is held (ignored while typing in the terminal) |
| `splash.js` | Intro: the monogram builds from blocks and comes apart. Once per session; the letter pattern is at the top of the file |
| `favicon.svg` | Tab icon |
