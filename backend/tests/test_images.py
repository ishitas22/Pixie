import unittest
from io import BytesIO

from PIL import Image

from app.config import MAX_IMAGE_BYTES
from app.images import ImageRejected, display_filename, heif_major_brand, validate_image
from tests.support import sample_heic, sample_jpeg, sample_png


class ImageValidationTests(unittest.TestCase):
    def test_accepts_png_and_jpeg(self) -> None:
        png = validate_image(sample_png("Apply by Friday"))
        jpeg = validate_image(sample_jpeg())
        self.assertEqual(png.media_type, "image/png")
        self.assertEqual(png.extension, ".png")
        self.assertEqual(jpeg.media_type, "image/jpeg")
        self.assertEqual(jpeg.extension, ".jpg")

    def test_rejects_text_file(self) -> None:
        with self.assertRaises(ImageRejected) as caught:
            validate_image(b"this is not an image")
        self.assertEqual(caught.exception.code, "unsupported_type")

    def test_rejects_truncated_png(self) -> None:
        with self.assertRaises(ImageRejected) as caught:
            validate_image(sample_png()[:24])
        self.assertEqual(caught.exception.code, "invalid_image")

    def test_rejects_oversized_file(self) -> None:
        payload = b"\x89PNG\r\n\x1a\n" + (b"0" * MAX_IMAGE_BYTES)
        with self.assertRaises(ImageRejected) as caught:
            validate_image(payload)
        self.assertEqual(caught.exception.code, "file_too_large")

    def test_safe_filename_does_not_keep_a_fake_extension(self) -> None:
        from app.images import safe_filename

        self.assertEqual(safe_filename("../notes.txt", ".png"), "notes.png")
        self.assertEqual(safe_filename("   ", ".jpg"), "screenshot.jpg")

    def test_heic_converts_to_jpeg_and_keeps_the_original_name(self) -> None:
        payload = sample_heic("Apply by Friday")
        self.assertEqual(heif_major_brand(payload), b"heic")
        converted = validate_image(payload, filename="IMG_2048.HEIC", content_type="image/heic")
        self.assertEqual(converted.extension, ".jpg")
        self.assertEqual(converted.media_type, "image/jpeg")
        self.assertTrue(converted.data.startswith(b"\xff\xd8\xff"))
        with Image.open(BytesIO(converted.data)) as image:
            image.load()
            self.assertGreater(image.width, 1)
        octet = validate_image(payload, filename="photo.heif", content_type="application/octet-stream")
        self.assertEqual(octet.media_type, "image/jpeg")
        blank_type = validate_image(payload, filename="photo.heic", content_type="")
        self.assertEqual(blank_type.extension, ".jpg")
        self.assertEqual(display_filename("IMG_2048.HEIC", ".jpg"), "IMG_2048.HEIC")
        self.assertEqual(display_filename("../notes.txt", ".png"), "notes.png")

    def test_recognizer_rejects_a_fake_heic(self) -> None:
        self.assertIsNone(heif_major_brand(b"this is not an image"))
        fake = b"\x00\x00\x00\x18ftypheic" + b"not-a-real-image"
        self.assertEqual(heif_major_brand(fake), b"heic")
        with self.assertRaises(ImageRejected) as caught:
            validate_image(fake, filename="copy.HEIC", content_type="application/octet-stream")
        self.assertEqual(caught.exception.code, "invalid_image")
        with self.assertRaises(ImageRejected) as claimed:
            validate_image(b"hello", filename="notes.heic", content_type="")
        self.assertEqual(claimed.exception.code, "invalid_image")
