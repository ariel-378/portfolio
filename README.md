# Portfolio

A one-page personal portfolio. Plain HTML, CSS and JavaScript — no build step.

## Run it

```bash
python3 dev/serve.py
# open http://localhost:8000
```

Any static host works (GitHub Pages, Netlify drop). Plain `python3 -m http.server`
also works, but the dev server above adds edit mode and turns off caching.

## Edit it in the browser

With `dev/serve.py` running, click **Edit page** in the bottom-right corner:

- **Text** — click any heading, paragraph, pill or link and retype it.
  Enter saves, Esc cancels. Inline markup like the gradient `<span>` is kept.
- **Images** — click any photo or dashed placeholder, choose a file and alt
  text, then Save. The file is copied into `images/` and the placeholder is
  swapped for a real `<img>` with the same shape class.

Every save is written straight into `index.html`, so the change is already
in the repo; commit when you are happy. Layout and colours still live in
`styles.css`. The editor (`dev/`) is injected only by the dev server and never
ships with the site. Tests: `python3 -m unittest dev/test_editlib.py`.

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
| `stars.js` | Shooting stars streak across the top of the hero; pressing Space makes them hop (ignored while typing in the terminal) |
| `splash.js` | Intro: the monogram builds from blocks and comes apart. Once per session; the letter pattern is at the top of the file |
| `favicon.svg` | Tab icon |
