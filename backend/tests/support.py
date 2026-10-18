"""Shared fixtures for Pixie tests."""

import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


class DataDirTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.old_data = os.environ.get("PIXIE_DATA_DIR")
        os.environ["PIXIE_DATA_DIR"] = self.tmp.name

    def tearDown(self) -> None:
        if self.old_data is None:
            os.environ.pop("PIXIE_DATA_DIR", None)
        else:
            os.environ["PIXIE_DATA_DIR"] = self.old_data
        self.tmp.cleanup()


def sample_png(text: str | None = None) -> bytes:
    image = Image.new("RGB", (1100, 320), "white")
    if text:
        draw = ImageDraw.Draw(image)
        font_path = Path(r"C:\Windows\Fonts\arial.ttf")
        font = ImageFont.truetype(str(font_path), 42) if font_path.is_file() else ImageFont.load_default()
        draw.text((48, 110), text, fill="black", font=font)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def sample_jpeg() -> bytes:
    image = Image.new("RGB", (80, 80), "white")
    buffer = BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def sample_heic(text: str | None = None) -> bytes:
    """A real HEIC container generated locally. This is not a phone capture."""
    from pillow_heif import register_heif_opener

    register_heif_opener()
    image = Image.new("RGB", (1100, 320), "white")
    if text:
        draw = ImageDraw.Draw(image)
        font_path = Path(r"C:\Windows\Fonts\arial.ttf")
        font = ImageFont.truetype(str(font_path), 42) if font_path.is_file() else ImageFont.load_default()
        draw.text((48, 110), text, fill="black", font=font)
    buffer = BytesIO()
    image.save(buffer, format="HEIF")
    return buffer.getvalue()
