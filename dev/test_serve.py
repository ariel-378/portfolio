"""Tests for the dev server's page resolution. Run from dev/: python3 -m unittest test_serve"""
import unittest
from pathlib import Path

import serve


class ResolvePageTests(unittest.TestCase):
    def test_root_is_index(self):
        self.assertEqual(serve.resolve_page("/"), serve.ROOT / "index.html")

    def test_folder_means_its_index(self):
        self.assertEqual(serve.resolve_page("/writing/"), serve.ROOT / "writing" / "index.html")

    def test_op_ed_page(self):
        page = serve.resolve_page("/writing/puerto-rican-statehood.html?x=1#top")
        self.assertEqual(page, serve.ROOT / "writing" / "puerto-rican-statehood.html")

    def test_non_html_is_not_a_page(self):
        self.assertIsNone(serve.resolve_page("/styles.css"))
        self.assertIsNone(serve.resolve_page("/images/fact-farm.png"))

    def test_missing_file_is_none(self):
        self.assertIsNone(serve.resolve_page("/writing/does-not-exist.html"))

    def test_dev_folder_is_off_limits(self):
        self.assertIsNone(serve.resolve_page("/dev/serve.py"))

    def test_traversal_outside_root_is_rejected(self):
        self.assertIsNone(serve.resolve_page("/../../etc/passwd.html"))
        self.assertIsNone(serve.resolve_page("/writing/../../other.html"))


class ApplyEditTests(unittest.TestCase):
    def test_rejects_unknown_page(self):
        with self.assertRaises(serve.editlib.EditError):
            serve.apply_edit({"page": "/nope.html", "id": 0, "mode": "inner", "html": "x"})


if __name__ == "__main__":
    unittest.main()
