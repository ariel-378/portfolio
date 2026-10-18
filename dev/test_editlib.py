"""Tests for the source-level edit helpers. Run: python3 -m unittest dev/test_editlib.py"""
import unittest

from editlib import (
    EditError, index_elements, inject_ids, replace_inner, replace_outer,
    safe_image_name, strip_ids,
)

DOC = (
    '<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8" /><title>T</title></head>\n'
    '<body>\n<h1>Hi <span class="grad">Ariel</span></h1>\n'
    '<div class="ph ph--16x9"><svg><use href="#ph-icon"/></svg></div>\n'
    '<p>Same</p><p>Same</p>\n<img src="a.png" alt="">\n</body>\n</html>\n'
)


class IndexElementsTest(unittest.TestCase):
    def test_numbers_elements_in_document_order(self):
        tags = [e.tag for e in index_elements(DOC)]
        self.assertEqual(
            tags, ["html", "head", "meta", "title", "body", "h1", "span",
                   "div", "svg", "use", "p", "p", "img"],
        )

    def test_records_offsets_that_slice_the_source(self):
        span = index_elements(DOC)[6]
        self.assertEqual(DOC[span.start:span.outer_end], '<span class="grad">Ariel</span>')
        self.assertEqual(DOC[span.start_end:span.end], "Ariel")

    def test_void_and_self_closing_tags_have_no_end(self):
        elements = index_elements(DOC)
        self.assertIsNone(elements[2].end)   # <meta />
        self.assertIsNone(elements[9].end)   # <use />
        self.assertIsNone(elements[12].end)  # <img>


class InjectIdsTest(unittest.TestCase):
    def test_stamps_sequential_ids_on_every_start_tag(self):
        out = inject_ids(DOC)
        self.assertIn('<h1 data-src-id="5">', out)
        self.assertIn('<span class="grad" data-src-id="6">', out)
        self.assertIn('<img src="a.png" alt="" data-src-id="12">', out)

    def test_keeps_self_closing_syntax(self):
        out = inject_ids(DOC)
        self.assertIn('<meta charset="UTF-8" data-src-id="2" />', out)
        self.assertIn('<use href="#ph-icon" data-src-id="9"/>', out)

    def test_strip_ids_reverses_injection(self):
        self.assertEqual(strip_ids(inject_ids(DOC)), DOC)


class ReplaceTest(unittest.TestCase):
    def test_replace_inner_targets_only_that_element(self):
        out = replace_inner(DOC, 11, "Changed")
        self.assertIn("<p>Same</p><p>Changed</p>", out)
        self.assertEqual(out.count("Same"), 1)

    def test_replace_inner_keeps_nested_markup_elsewhere(self):
        out = replace_inner(DOC, 5, 'Hey <span class="grad">You</span>')
        self.assertIn('<h1>Hey <span class="grad">You</span></h1>', out)
        self.assertIn('<div class="ph ph--16x9"><svg>', out)

    def test_replace_inner_drops_echoed_ids(self):
        out = replace_inner(DOC, 5, 'Hey <span class="grad" data-src-id="6">You</span>')
        self.assertNotIn("data-src-id", out)

    def test_replace_inner_rejects_void_elements(self):
        with self.assertRaises(EditError):
            replace_inner(DOC, 12, "x")

    def test_replace_outer_swaps_placeholder_for_image(self):
        out = replace_outer(DOC, 7, '<img class="pic ph--16x9" src="images/x.png" alt="x">')
        self.assertIn('<img class="pic ph--16x9" src="images/x.png" alt="x">\n<p>Same</p>', out)
        self.assertNotIn("ph-icon", out)

    def test_replace_outer_handles_void_target(self):
        out = replace_outer(DOC, 12, '<img src="b.png" alt="b">')
        self.assertIn('<img src="b.png" alt="b">\n</body>', out)

    def test_unknown_id_raises(self):
        with self.assertRaises(EditError):
            replace_inner(DOC, 99, "x")

    def test_oversized_fragment_raises(self):
        with self.assertRaises(EditError):
            replace_inner(DOC, 5, "x" * 200_001)


class SafeImageNameTest(unittest.TestCase):
    def test_sanitises_and_lowercases(self):
        self.assertEqual(safe_image_name("My Photo (1).PNG", set()), "my-photo-1.png")

    def test_strips_directories(self):
        self.assertEqual(safe_image_name("../../etc/passwd.jpg", set()), "passwd.jpg")

    def test_adds_suffix_when_taken(self):
        self.assertEqual(safe_image_name("a.png", {"a.png", "a-2.png"}), "a-3.png")

    def test_defaults_when_name_is_empty(self):
        self.assertEqual(safe_image_name("", set()), "image.png")


if __name__ == "__main__":
    unittest.main()
