"""Source-level HTML editing for the local edit mode.

Every element in index.html is numbered in document order. The dev server
stamps that number onto each element as ``data-src-id`` when it serves the
page, and the in-page editor sends it back with an edit, so a change made in
the browser lands on exactly the right spot in the source file. Nothing is
re-serialised from the DOM: only the edited element's text is spliced in.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Optional

ID_ATTR = "data-src-id"
VOID_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
})
MAX_FRAGMENT_CHARS = 200_000
_ID_ATTR_RE = re.compile(r'\s+' + ID_ATTR + r'="\d+"')
_SAFE_NAME_RE = re.compile(r"[^a-z0-9._-]+")
_TAG_CLOSE_RE = re.compile(r"\s*/?>$")


class EditError(ValueError):
    """Raised when an edit cannot be applied to the source."""


@dataclass(frozen=True)
class Element:
    index: int
    tag: str
    start: int            # offset of "<" opening the start tag
    start_end: int        # offset just past ">" closing the start tag
    end: Optional[int]    # offset of "<" opening the end tag, None if void
    end_end: Optional[int]  # offset just past ">" closing the end tag

    @property
    def outer_end(self) -> int:
        return self.start_end if self.end_end is None else self.end_end


class _Indexer(HTMLParser):
    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self._source = source
        self._line_starts = _line_starts(source)
        self.elements: list[Element] = []
        self._open: list[int] = []

    def _offset(self) -> int:
        line, col = self.getpos()
        return self._line_starts[line - 1] + col

    def _add(self, tag: str, is_open: bool) -> None:
        start = self._offset()
        raw = self.get_starttag_text() or ""
        element = Element(len(self.elements), tag, start, start + len(raw), None, None)
        self.elements.append(element)
        if is_open:
            self._open.append(element.index)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        self._add(tag, is_open=tag not in VOID_TAGS)

    def handle_startendtag(self, tag: str, attrs: list) -> None:
        self._add(tag, is_open=False)

    def handle_endtag(self, tag: str) -> None:
        for depth in range(len(self._open) - 1, -1, -1):
            element = self.elements[self._open[depth]]
            if element.tag != tag:
                continue
            end = self._offset()
            end_end = self._source.index(">", end) + 1
            self.elements[element.index] = Element(
                element.index, element.tag, element.start, element.start_end, end, end_end,
            )
            del self._open[depth:]
            return


def _line_starts(source: str) -> list[int]:
    starts = [0]
    for match in re.finditer(r"\n", source):
        starts.append(match.end())
    return starts


def index_elements(source: str) -> list[Element]:
    """Return every element in ``source`` in document order with its offsets."""
    parser = _Indexer(source)
    parser.feed(source)
    parser.close()
    return parser.elements


def inject_ids(source: str) -> str:
    """Return ``source`` with ``data-src-id`` stamped onto every start tag."""
    pieces: list[str] = []
    cursor = 0
    for element in index_elements(source):
        raw = source[element.start:element.start_end]
        insert_at = element.start + _TAG_CLOSE_RE.search(raw).start()
        pieces.append(source[cursor:insert_at])
        pieces.append(f' {ID_ATTR}="{element.index}"')
        cursor = insert_at
    pieces.append(source[cursor:])
    return "".join(pieces)


def strip_ids(fragment: str) -> str:
    """Remove any ``data-src-id`` attributes the browser may have echoed back."""
    return _ID_ATTR_RE.sub("", fragment)


def _lookup(source: str, index: int) -> Element:
    elements = index_elements(source)
    if not 0 <= index < len(elements):
        raise EditError(f"No element with id {index}")
    return elements[index]


def _check_fragment(fragment: str) -> str:
    if len(fragment) > MAX_FRAGMENT_CHARS:
        raise EditError("Edit is too large")
    return strip_ids(fragment)


def replace_inner(source: str, index: int, fragment: str) -> str:
    """Return ``source`` with element ``index``'s contents replaced."""
    fragment = _check_fragment(fragment)
    element = _lookup(source, index)
    if element.end is None:
        raise EditError(f"<{element.tag}> has no contents to replace")
    return source[:element.start_end] + fragment + source[element.end:]


def replace_outer(source: str, index: int, fragment: str) -> str:
    """Return ``source`` with element ``index`` itself replaced."""
    fragment = _check_fragment(fragment)
    element = _lookup(source, index)
    return source[:element.start] + fragment + source[element.outer_end:]


def safe_image_name(name: str, taken: set[str]) -> str:
    """Return a filesystem-safe, unique version of an uploaded file name."""
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    stem, dot, ext = base.rpartition(".")
    if not dot:
        stem, ext = base, "png"
    stem = _SAFE_NAME_RE.sub("-", stem).strip("-.") or "image"
    ext = _SAFE_NAME_RE.sub("", ext) or "png"
    candidate = f"{stem}.{ext}"
    counter = 2
    while candidate in taken:
        candidate = f"{stem}-{counter}.{ext}"
        counter += 1
    return candidate
