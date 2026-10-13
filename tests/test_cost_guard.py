"""Fuel Pro MVP cost guard: fail CI if paid map SDKs appear without review."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
CHECK = ("app.js", "index.html", "style.css")
BLOCKED = [
    re.compile(r"maps\.googleapis\.com/maps/api/js", re.I),
    re.compile(r"places\.googleapis\.com", re.I),
    re.compile(r"api\.mapbox\.com", re.I),
    re.compile(r"api\.maptiler\.com", re.I),
    re.compile(r"api\.tomtom\.com", re.I),
]

class FreeMvpGuardTest(unittest.TestCase):
    def test_no_paid_map_sdk_integrated(self):
        for relpath in CHECK:
            content = (ROOT / relpath).read_text(encoding="utf-8")
            for pattern in BLOCKED:
                with self.subTest(file=relpath,pattern=pattern.pattern):
                    self.assertIsNone(pattern.search(content),
                                      "Paid/usage-billed map provider requires explicit approval.")
    def test_openstreetmap_has_attribution(self):
        source = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("tile.openstreetmap.org", source)
        self.assertIn("OpenStreetMap contributors", source)

if __name__ == "__main__":
    unittest.main()
