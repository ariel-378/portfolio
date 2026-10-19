// In-page editor. Injected by dev/serve.py; never part of the published site.
// Click "Edit page", then click any text to retype it or any image to swap it.
// Each change is written straight into this page's HTML file (and images/) by
// the server, whether that is index.html or an op-ed under writing/.
(function () {
  "use strict";

  const ID_ATTR = "data-src-id";
  const STORAGE_KEY = "__portfolio-edit-mode";
  const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "a", "span", "em",
    "strong", "small", "figcaption", "dt", "dd", "td", "th", "button", "blockquote", "cite", "time", "label"]);
  const INLINE_TAGS = new Set(["a", "abbr", "b", "br", "cite", "code", "em", "i", "kbd", "mark",
    "small", "span", "strong", "sub", "sup", "time", "u", "wbr"]);
  const RUNTIME_CLASSES = ["is-active", "is-visible", "is-open", "is-shown", "is-typing"];
  const EXCLUDE = "script, style, svg, #terminal-lines, .splash, [data-noedit], #__editor";
  const STATUS_MS = 2200;

  const state = { editing: false, active: null, imageTarget: null, pendingFile: null };
  const ui = buildToolbar();

  // ── Targets ───────────────────────────────────────────────────────────────
  function idOf(el) { return Number(el.getAttribute(ID_ATTR)); }

  function isTextTarget(el) {
    return el.hasAttribute(ID_ATTR)
      && TEXT_TAGS.has(el.tagName.toLowerCase())
      && Array.from(el.children).every((c) => INLINE_TAGS.has(c.tagName.toLowerCase()))
      && el.textContent.trim() !== "";
  }

  function collectTextTargets(node, out) {
    for (const el of node.children) {
      if (el.matches(EXCLUDE)) continue;
      if (isTextTarget(el)) out.push(el);
      else collectTextTargets(el, out);
    }
    return out;
  }

  function collectImageTargets() {
    return Array.from(document.querySelectorAll(`img[${ID_ATTR}], .ph[${ID_ATTR}]`))
      .filter((el) => !el.closest(EXCLUDE));
  }

  function setEditing(isOn) {
    state.editing = isOn;
    document.body.classList.toggle("__editing", isOn);
    ui.toggle.textContent = isOn ? "Done editing" : "Edit page";
    ui.toggle.classList.toggle("__primary", !isOn);
    ui.hint.hidden = !isOn;
    collectTextTargets(document.body, []).forEach((el) => {
      el.classList.toggle("__edit-text", isOn);
      if (isOn) { el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "true"); }
      else { el.removeAttribute("contenteditable"); el.removeAttribute("spellcheck"); }
    });
    collectImageTargets().forEach((el) => el.classList.toggle("__edit-img", isOn));
    if (!isOn) closeImagePanel();
    try { localStorage.setItem(STORAGE_KEY, isOn ? "1" : ""); } catch (_) { /* private mode */ }
  }

  // ── Text editing ──────────────────────────────────────────────────────────
  function beginText(el) {
    state.active = { el, original: el.innerHTML, oldDesc: el.querySelectorAll("*").length };
  }

  async function commitText(el) {
    const active = state.active;
    state.active = null;
    if (!active || active.el !== el || el.innerHTML === active.original) return;
    const html = el.children.length === 0 ? escapeHtml(el.textContent) : cleanClone(el).innerHTML;
    try {
      await post("/__edit", { page: location.pathname, id: idOf(el), mode: "inner", html });
      renumber(el, idOf(el), active.oldDesc, el.querySelectorAll("*").length, false);
      status("Saved");
    } catch (err) {
      el.innerHTML = active.original;
      status(err.message, true);
    }
  }

  function cancelText(el) {
    if (state.active && state.active.el === el) el.innerHTML = state.active.original;
    state.active = null;
    el.blur();
  }

  // ── Image editing ─────────────────────────────────────────────────────────
  function openImagePanel(target) {
    state.imageTarget = target;
    state.pendingFile = null;
    ui.file.value = "";
    ui.alt.value = target.getAttribute("alt") || target.getAttribute("aria-label") || "";
    ui.panel.classList.add("__open");
    ui.alt.focus();
  }

  function closeImagePanel() {
    state.imageTarget = null;
    state.pendingFile = null;
    ui.panel.classList.remove("__open");
  }

  async function saveImage() {
    const target = state.imageTarget;
    if (!target) return;
    try {
      const isImg = target.tagName === "IMG";
      const img = isImg ? cleanClone(target, false) : placeholderToImg(target);
      if (state.pendingFile) {
        const upload = await uploadFile(state.pendingFile);
        img.setAttribute("src", pathFromThisPage(upload.path));
        img.setAttribute("width", upload.width);
        img.setAttribute("height", upload.height);
      } else if (!isImg) {
        throw new Error("Choose an image file first.");
      }
      img.setAttribute("alt", ui.alt.value.trim());
      const id = idOf(target);
      const oldDesc = target.querySelectorAll("*").length;
      await post("/__edit", { page: location.pathname, id, mode: "outer", html: img.outerHTML });
      target.replaceWith(img);
      renumber(img, id, oldDesc, 0, true);
      img.classList.add("__edit-img");
      closeImagePanel();
      status("Saved");
    } catch (err) {
      status(err.message, true);
    }
  }

  // The server stores uploads as "images/…" relative to the site root; a page
  // in a subfolder (writing/) needs "../" in front for each level down.
  function pathFromThisPage(rootRelative) {
    const depth = location.pathname.split("/").filter(Boolean).length - (location.pathname.endsWith("/") ? 0 : 1);
    return "../".repeat(Math.max(0, depth)) + rootRelative;
  }

  function placeholderToImg(ph) {
    const img = document.createElement("img");
    const keep = Array.from(ph.classList).filter((c) => c !== "ph" && !c.startsWith("__"));
    img.className = ["pic", ...keep].join(" ");
    img.setAttribute("loading", "lazy");
    return img;
  }

  async function uploadFile(file) {
    const dataUrl = await readAsDataUrl(file);
    const size = await imageSize(dataUrl);
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const result = await post("/__upload", { name: file.name, data });
    return { path: result.path, width: size.width, height: size.height };
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
  }

  function imageSize(dataUrl) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => reject(new Error("That file is not an image the browser can show."));
      probe.src = dataUrl;
    });
  }

  // ── Source bookkeeping ────────────────────────────────────────────────────
  // After an edit, ids after the edited element shift by the change in its
  // descendant count, and the new subtree is numbered fresh.
  function renumber(root, startId, oldDesc, newDesc, includeRoot) {
    const delta = newDesc - oldDesc;
    if (delta !== 0) {
      document.querySelectorAll(`[${ID_ATTR}]`).forEach((el) => {
        const id = idOf(el);
        if (id > startId + oldDesc) el.setAttribute(ID_ATTR, String(id + delta));
      });
    }
    let next = includeRoot ? startId : startId + 1;
    const nodes = includeRoot ? [root, ...root.querySelectorAll("*")] : Array.from(root.querySelectorAll("*"));
    nodes.forEach((n) => n.setAttribute(ID_ATTR, String(next++)));
  }

  function cleanClone(el, deep = true) {
    const clone = el.cloneNode(deep);
    [clone, ...clone.querySelectorAll("*")].forEach((n) => {
      n.removeAttribute(ID_ATTR);
      n.removeAttribute("contenteditable");
      n.removeAttribute("spellcheck");
      n.classList.remove("__edit-text", "__edit-img", ...RUNTIME_CLASSES);
      if (!n.classList.length) n.removeAttribute("class");
    });
    return clone;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function post(url, body) {
    let response;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (_) {
      throw new Error("Dev server not reachable. Is dev/serve.py still running?");
    }
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!result.ok) throw new Error(result.error || "Save failed");
    return result;
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────
  function buildToolbar() {
    const root = document.createElement("div");
    root.id = "__editor";
    root.innerHTML = `
      <div class="__status" role="status" aria-live="polite"></div>
      <div class="__panel">
        <label>Image file<input type="file" accept="image/*"></label>
        <label>Alt text<input type="text" placeholder="Describe the image"></label>
        <div class="__row"><button type="button" class="__small __cancel">Cancel</button><button type="button" class="__small __primary __save">Save</button></div>
      </div>
      <div class="__hint" hidden>Click text to edit · Enter saves · Esc cancels · click an image to swap it</div>
      <button type="button" class="__toggle __primary">Edit page</button>`;
    document.body.appendChild(root);
    return {
      root,
      statusEl: root.querySelector(".__status"),
      panel: root.querySelector(".__panel"),
      file: root.querySelector("input[type=file]"),
      alt: root.querySelector("input[type=text]"),
      hint: root.querySelector(".__hint"),
      toggle: root.querySelector(".__toggle"),
      save: root.querySelector(".__save"),
      cancel: root.querySelector(".__cancel"),
    };
  }

  let statusTimer = null;
  function status(message, isError = false) {
    ui.statusEl.textContent = message;
    ui.statusEl.classList.toggle("__error", isError);
    ui.statusEl.classList.add("__show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => ui.statusEl.classList.remove("__show"), isError ? STATUS_MS * 3 : STATUS_MS);
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  ui.toggle.addEventListener("click", () => setEditing(!state.editing));
  ui.save.addEventListener("click", saveImage);
  ui.cancel.addEventListener("click", closeImagePanel);
  ui.file.addEventListener("change", () => { state.pendingFile = ui.file.files[0] || null; });
  ui.alt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveImage(); } });

  document.addEventListener("focusin", (e) => {
    if (state.editing && e.target.classList.contains("__edit-text")) beginText(e.target);
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.classList.contains("__edit-text")) commitText(e.target);
  });
  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest(".__edit-text");
    if (!el) return;
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    if (e.key === "Escape") { e.preventDefault(); cancelText(el); }
  });
  document.addEventListener("paste", (e) => {
    if (!e.target.closest || !e.target.closest(".__edit-text")) return;
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
  document.addEventListener("click", (e) => {
    if (!state.editing || e.target.closest("#__editor")) return;
    const image = e.target.closest(".__edit-img");
    if (image) { e.preventDefault(); openImagePanel(image); return; }
    if (e.target.closest("a") && e.target.closest(".__edit-text")) e.preventDefault();
  }, true);

  let wasOn = false;
  try { wasOn = localStorage.getItem(STORAGE_KEY) === "1"; } catch (_) { /* ignore */ }
  if (wasOn) setEditing(true);
})();
