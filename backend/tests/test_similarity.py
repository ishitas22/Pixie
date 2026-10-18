"""Similarity stays local: hashes, upload pairs, and deleting one screenshot."""

from datetime import date
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import database
from app.config import image_dir
from app.main import app, backfill_image_hashes
from app.similarity import SIMILAR_MAX_DISTANCE, hamming_distance, is_similar, perceptual_hash
from tests.support import DataDirTest, sample_png


def cropped_jpeg(png_bytes: bytes) -> bytes:
    """Re-save with JPEG compression and a slim margin crop."""
    image = Image.open(BytesIO(png_bytes)).convert("RGB")
    width, height = image.size
    cropped = image.crop((12, 8, width - 14, height - 10))
    buffer = BytesIO()
    cropped.save(buffer, format="JPEG", quality=55)
    return buffer.getvalue()


def different_png() -> bytes:
    image = Image.new("RGB", (900, 1400), "#1d4e89")
    draw = ImageDraw.Draw(image)
    draw.rectangle((70, 180, 820, 980), fill="#f3eee4")
    draw.ellipse((180, 1040, 720, 1320), fill="#d8efe6")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class HashTests(DataDirTest):
    def test_exact_duplicate_hash_matches(self) -> None:
        data = sample_png("Apply by Friday at the Student Center")
        first = perceptual_hash(data)
        second = perceptual_hash(data)
        self.assertEqual(first, second)
        self.assertEqual(hamming_distance(first, second), 0)
        self.assertTrue(is_similar(first, second))

    def test_recompressed_crop_matches_and_a_different_image_does_not(self) -> None:
        original = sample_png("Campus career fair Friday 4:00 PM")
        near = perceptual_hash(cropped_jpeg(original))
        other = perceptual_hash(different_png())
        source = perceptual_hash(original)
        self.assertLessEqual(hamming_distance(source, near), SIMILAR_MAX_DISTANCE)
        self.assertTrue(is_similar(source, near))
        self.assertGreater(hamming_distance(source, other), SIMILAR_MAX_DISTANCE)
        self.assertFalse(is_similar(source, other))


class SimilarityApiTests(DataDirTest):
    def setUp(self) -> None:
        super().setUp()
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        super().tearDown()

    def test_second_upload_reports_the_similar_pair_without_qwen(self) -> None:
        payload = sample_png("Apply by Friday at the Student Center")
        with (
            patch("app.main.ocr.extract_text", return_value="Apply by Friday at the Student Center"),
            patch("app.main.extractor.extract_items") as extract_items,
        ):
            first = self.client.post(
                "/api/screenshots",
                files={"file": ("fair.png", payload, "image/png")},
            )
            second = self.client.post(
                "/api/screenshots",
                files={"file": ("fair-copy.png", payload, "image/png")},
            )
            near = self.client.post(
                "/api/screenshots",
                files={"file": ("fair-small.jpg", cropped_jpeg(payload), "image/jpeg")},
            )
            other = self.client.post(
                "/api/screenshots",
                files={"file": ("flyer.png", different_png(), "image/png")},
            )
        extract_items.assert_not_called()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["similar"], [])
        self.assertEqual(second.status_code, 200, second.text)
        pair_ids = {item["id"] for item in second.json()["similar"]}
        self.assertIn(first.json()["screenshot"]["id"], pair_ids)
        self.assertLessEqual(second.json()["similar"][0]["distance"], SIMILAR_MAX_DISTANCE)
        self.assertTrue(second.json()["similar"][0]["filename"])
        self.assertTrue(second.json()["similar"][0]["image_url"])
        near_ids = {item["id"] for item in near.json()["similar"]}
        self.assertIn(first.json()["screenshot"]["id"], near_ids)
        self.assertEqual(other.status_code, 200, other.text)
        self.assertEqual(other.json()["similar"], [])

    def test_duplicate_without_text_still_returns_the_pair(self) -> None:
        payload = different_png()
        with (
            patch("app.main.ocr.extract_text", return_value="   "),
            patch("app.main.extractor.extract_items") as extract_items,
        ):
            first = self.client.post(
                "/api/screenshots",
                files={"file": ("shapes.png", payload, "image/png")},
            )
            second = self.client.post(
                "/api/screenshots",
                files={"file": ("shapes-copy.png", payload, "image/png")},
            )
        extract_items.assert_not_called()
        self.assertEqual(first.status_code, 422, first.text)
        self.assertEqual(second.status_code, 422, second.text)
        self.assertEqual(second.json()["similar"][0]["id"], first.json()["screenshot"]["id"])

    def test_missing_hash_is_filled_and_still_matches(self) -> None:
        payload = sample_png("Lab safety Monday 9:15 AM")
        database.init_db()
        saved = database.insert_screenshot(
            original_filename="lab.png",
            extension=".png",
            media_type="image/png",
            ocr_text="Lab safety Monday 9:15 AM",
            data=payload,
        )
        self.assertIsNone(saved["image_hash"])
        backfill_image_hashes()
        filled = database.get_screenshot(saved["id"])
        assert filled is not None
        self.assertEqual(filled["ocr_text"], "Lab safety Monday 9:15 AM")
        self.assertTrue(filled["image_hash"])
        self.assertTrue((image_dir() / filled["stored_name"]).is_file())

        with patch("app.main.ocr.extract_text", return_value="Lab safety Monday 9:15 AM"):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("lab-again.png", payload, "image/png")},
            )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        self.assertEqual(uploaded.json()["similar"][0]["id"], saved["id"])

    def test_delete_removes_only_that_screenshot_and_its_tasks(self) -> None:
        payload = sample_png("Apply by 2026-10-10")
        other_payload = different_png()
        with patch("app.main.ocr.extract_text", return_value="Apply by 2026-10-10"):
            kept = self.client.post(
                "/api/screenshots",
                files={"file": ("keep.png", payload, "image/png")},
            )
            extra = self.client.post(
                "/api/screenshots",
                files={"file": ("other.png", other_payload, "image/png")},
            )
        self.assertEqual(kept.status_code, 200, kept.text)
        kept_id = kept.json()["screenshot"]["id"]
        extra_id = extra.json()["screenshot"]["id"]
        kept_row = database.get_screenshot(kept_id)
        extra_row = database.get_screenshot(extra_id)
        assert kept_row is not None and extra_row is not None
        database.insert_tasks(
            kept_id,
            [
                {
                    "title": "Reserve a resume review",
                    "details": None,
                    "category": "Career Opportunities",
                    "deadline": date(2026, 10, 10).isoformat(),
                    "supporting_text": "Apply by 2026-10-10",
                }
            ],
        )
        database.insert_tasks(
            extra_id,
            [
                {
                    "title": "Read the flyer",
                    "details": None,
                    "category": "Campus events",
                    "deadline": None,
                    "supporting_text": "Club fair",
                }
            ],
        )

        removed = self.client.delete(f"/api/screenshots/{extra_id}")
        self.assertEqual(removed.status_code, 200, removed.text)
        self.assertEqual(removed.json()["deleted"], extra_id)
        self.assertIsNone(database.get_screenshot(extra_id))
        self.assertEqual(database.items_for_screenshot(extra_id), [])
        self.assertFalse((image_dir() / extra_row["stored_name"]).exists())
        self.assertIsNotNone(database.get_screenshot(kept_id))
        self.assertTrue((image_dir() / kept_row["stored_name"]).is_file())
        remaining = database.list_tasks()
        self.assertEqual([task["title"] for task in remaining], ["Reserve a resume review"])
        self.assertEqual(remaining[0]["screenshot_id"], kept_id)

        removed_kept = self.client.delete(f"/api/screenshots/{kept_id}")
        self.assertEqual(removed_kept.status_code, 200, removed_kept.text)
        self.assertEqual(database.list_tasks(), [])
        self.assertEqual(database.items_for_screenshot(kept_id), [])
        self.assertIsNone(database.get_screenshot(kept_id))
        self.assertFalse((image_dir() / kept_row["stored_name"]).exists())
        missing = self.client.delete(f"/api/screenshots/{kept_id}")
        self.assertEqual(missing.status_code, 404)
