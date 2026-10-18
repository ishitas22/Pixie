import tempfile
import unittest
from pathlib import Path

from PIL import Image

from app.images import validate_image
from app.ocr import check_tesseract, clean_ocr, extract_text, has_readable_text
from tests.support import sample_heic, sample_png


class OcrHelperTests(unittest.TestCase):
    def test_readable_text_requires_a_real_token(self) -> None:
        self.assertFalse(has_readable_text(" \n | "))
        self.assertFalse(has_readable_text(""))
        self.assertTrue(has_readable_text("Apply by 2026-11-01"))

    def test_clean_ocr_drops_form_feeds_and_extra_blank_lines(self) -> None:
        self.assertEqual(clean_ocr("Hello\x0c\n\n\nWorld  "), "Hello\n\nWorld")


class TesseractTests(unittest.TestCase):
    def setUp(self) -> None:
        ok, message = check_tesseract()
        if not ok:
            self.skipTest(message)

    def test_reads_synthetic_screenshot_text(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "note.png"
            path.write_bytes(sample_png("Apply by 2026-11-01"))
            text = extract_text(path)
        self.assertIn("Apply", text)
        self.assertIn("2026", text)

    def test_reads_text_from_a_generated_heic_converted_to_jpeg(self) -> None:
        converted = validate_image(
            sample_heic("Apply by 2026-11-01"),
            filename="note.heic",
            content_type="image/heic",
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "note.jpg"
            path.write_bytes(converted.data)
            text = extract_text(path)
        self.assertIn("Apply", text)
        self.assertIn("2026", text)

    def test_blank_image_has_no_readable_text(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "blank.png"
            image = Image.new("RGB", (400, 200), "white")
            image.save(path, format="PNG")
            text = extract_text(path)
        self.assertFalse(has_readable_text(text))
