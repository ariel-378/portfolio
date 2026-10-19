"""Local dev server with in-page editing.

    python3 dev/serve.py [port]      # default 8000

Serves the site from the repo root with caching disabled and injects the
editor (dev/editor.js + dev/editor.css) into every HTML page: the home page
and each op-ed under writing/. Text and image edits made in the browser are
written straight back to that page's file and images/. Binds to 127.0.0.1
only; the published site never includes any of this.
"""
from __future__ import annotations

import base64
import json
import sys
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import editlib  # noqa: E402

DEV_DIR = Path(__file__).resolve().parent
ROOT = DEV_DIR.parent
INDEX = ROOT / "index.html"
NOT_EDITABLE_DIRS = {"dev", "node_modules", ".git"}
IMAGES = ROOT / "images"
DEFAULT_PORT = 8000
MAX_BODY_BYTES = 20 * 1024 * 1024
ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp", "svg", "avif"}
EDITOR_ASSETS = {"/__editor/editor.js": "editor.js", "/__editor/editor.css": "editor.css"}
HEAD_INJECT = '<link rel="stylesheet" href="/__editor/editor.css">\n</head>'
BODY_INJECT = '<script src="/__editor/editor.js"></script>\n</body>'

_write_lock = threading.Lock()


def resolve_page(url_path: str) -> Optional[Path]:
    """The HTML file a request path refers to, or None if it is not an editable page.

    ``/`` and ``/writing/`` mean that folder's index.html. Only ``.html`` files
    inside the site root count, never anything under dev/ or outside the repo.
    """
    clean = url_path.split("?", 1)[0].split("#", 1)[0]
    if clean.endswith("/"):
        clean += "index.html"
    if not clean.endswith(".html") or "\\" in clean:
        return None
    try:
        target = (ROOT / clean.lstrip("/")).resolve()
        relative = target.relative_to(ROOT)
    except (ValueError, OSError):
        return None
    if relative.parts and relative.parts[0] in NOT_EDITABLE_DIRS:
        return None
    return target if target.is_file() else None


def render_page(page: Path) -> bytes:
    source = page.read_text(encoding="utf-8")
    rendered = editlib.inject_ids(source)
    rendered = rendered.replace("</head>", HEAD_INJECT, 1).replace("</body>", BODY_INJECT, 1)
    return rendered.encode("utf-8")


def apply_edit(payload: dict) -> None:
    index = payload.get("id")
    mode = payload.get("mode")
    fragment = payload.get("html")
    page_url = payload.get("page", "/")
    if not isinstance(index, int) or mode not in ("inner", "outer") or not isinstance(fragment, str):
        raise editlib.EditError("Expected {id: int, mode: 'inner'|'outer', html: str}")
    page = resolve_page(page_url) if isinstance(page_url, str) else None
    if page is None:
        raise editlib.EditError(f"Not an editable page: {page_url!r}")
    with _write_lock:
        source = page.read_text(encoding="utf-8")
        replace = editlib.replace_inner if mode == "inner" else editlib.replace_outer
        page.write_text(replace(source, index, fragment), encoding="utf-8")


def save_upload(payload: dict) -> str:
    name, data = payload.get("name"), payload.get("data")
    if not isinstance(name, str) or not isinstance(data, str):
        raise editlib.EditError("Expected {name: str, data: base64 str}")
    try:
        raw = base64.b64decode(data, validate=True)
    except ValueError as exc:
        raise editlib.EditError("Image data is not valid base64") from exc
    if not raw:
        raise editlib.EditError("Image file is empty")
    IMAGES.mkdir(exist_ok=True)
    with _write_lock:
        safe = editlib.safe_image_name(name, {p.name for p in IMAGES.iterdir()})
        if safe.rsplit(".", 1)[-1] not in ALLOWED_IMAGE_EXT:
            raise editlib.EditError("Only png, jpg, gif, webp, svg or avif images are allowed")
        (IMAGES / safe).write_bytes(raw)
    return f"images/{safe}"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        page = resolve_page(path)
        if page is not None:
            return self._send(HTTPStatus.OK, "text/html; charset=utf-8", render_page(page))
        if path in EDITOR_ASSETS:
            asset = DEV_DIR / EDITOR_ASSETS[path]
            kind = "text/javascript" if asset.suffix == ".js" else "text/css"
            return self._send(HTTPStatus.OK, f"{kind}; charset=utf-8", asset.read_bytes())
        super().do_GET()

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            if self.path == "/__edit":
                apply_edit(payload)
                result = {"ok": True}
            elif self.path == "/__upload":
                result = {"ok": True, "path": save_upload(payload)}
            else:
                return self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown endpoint"})
            self._json(HTTPStatus.OK, result)
        except editlib.EditError as exc:
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - report anything else to the page
            self.log_error("edit failed: %r", exc)
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": f"Server error: {exc}"})

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            raise editlib.EditError("Request body is missing or too large")
        try:
            payload = json.loads(self.rfile.read(length))
        except ValueError as exc:
            raise editlib.EditError("Request body is not valid JSON") from exc
        if not isinstance(payload, dict):
            raise editlib.EditError("Request body must be a JSON object")
        return payload

    def _json(self, status: HTTPStatus, body: dict) -> None:
        self._send(status, "application/json", json.dumps(body).encode("utf-8"))

    def _send(self, status: HTTPStatus, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Editing the site at http://localhost:{port}/  (every .html page, op-eds included; Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
