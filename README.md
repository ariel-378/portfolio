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
- **Images** — each placeholder is a `<div class="ph ph--16x9">` (or `--square`,
  `--portrait`, `--circle`, `--wide`). Swap the whole `div` for an `<img>` with
  the same class to keep the sizing, e.g.
  `<img class="ph--16x9" src="images/project.png" alt="…">`, and drop the
  dashed look by removing the `ph` class.
- **Sections** — each is a `<section id="…">`; the nav links match the ids.
- **Colors and fonts** — tokens at the top of `styles.css`.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page: hero, experience, projects, courses, publications, leadership, volunteer, fun facts, contact |
| `styles.css` | All styles; design tokens in `:root`; mobile layout at the bottom |
| `script.js` | Mobile nav, scroll-reveal, active nav link |
| `favicon.svg` | Tab icon |
