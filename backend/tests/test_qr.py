"""Local QR decoding. Payloads stay exact and are never fetched."""

from datetime import date
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app import database
from app.extractor import apply_model_payload
from app.main import app
from app.qr import UNREADABLE_NOTE, associate_qr_links, scan_image
from app.schemas import ActionKind, Category, ExtractedItem, ExtractedTask
from tests.support import DataDirTest, sample_png


def _encode(text: str, scale: int) -> np.ndarray:
    image = cv2.QRCodeEncoder_create().encode(text)
    if scale <= 1:
        return image
    big = cv2.resize(
        image,
        (image.shape[1] * scale, image.shape[0] * scale),
        interpolation=cv2.INTER_NEAREST,
    )
    pad = 40
    canvas = np.full((big.shape[0] + pad * 2, big.shape[1] + pad * 2), 255, np.uint8)
    canvas[pad : pad + big.shape[0], pad : pad + big.shape[1]] = big
    return canvas


def qr_png(*texts: str, scale: int = 12) -> bytes:
    tiles = [_encode(text, scale) for text in texts]
    if len(tiles) == 1:
        image = tiles[0]
    else:
        height = max(tile.shape[0] for tile in tiles)
        width = sum(tile.shape[1] for tile in tiles) + 30 * (len(tiles) - 1)
        image = np.full((height, width), 255, np.uint8)
        cursor = 0
        for tile in tiles:
            image[0 : tile.shape[0], cursor : cursor + tile.shape[1]] = tile
            cursor += tile.shape[1] + 30
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode a QR fixture.")
    return encoded.tobytes()


def photographed_jpeg(payload: str) -> bytes:
    """A tilted, shadowed code on a page. This is generated, not a personal photo."""
    qr = cv2.QRCodeEncoder_create().encode(payload)
    qr = cv2.resize(qr, None, fx=6, fy=6, interpolation=cv2.INTER_NEAREST)
    height, width = qr.shape[:2]
    source = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
    destination = np.float32(
        [
            [width * 0.18, height * 0.02],
            [width * 0.98, height * 0.12],
            [width * 0.82, height * 0.96],
            [width * 0.02, height * 0.78],
        ]
    )
    warped = cv2.warpPerspective(
        qr,
        cv2.getPerspectiveTransform(source, destination),
        (width, height),
        borderValue=255,
    )
    page = np.full((900, 1400), 236, np.uint8)
    y0, x0 = 260, 420
    page[y0 : y0 + height, x0 : x0 + width] = warped
    gradient = np.linspace(0.25, 1.0, page.shape[1], dtype=np.float32)
    shaded = np.clip(page.astype(np.float32) * gradient, 0, 255).astype(np.uint8)
    shaded = cv2.GaussianBlur(shaded, (3, 3), 0)
    ok, encoded = cv2.imencode(".jpg", shaded, [int(cv2.IMWRITE_JPEG_QUALITY), 38])
    if not ok:
        raise RuntimeError("Could not encode a photographed QR fixture.")
    return encoded.tobytes()


def blank_png() -> bytes:
    ok, encoded = cv2.imencode(".png", np.full((300, 300), 255, np.uint8))
    if not ok:
        raise RuntimeError("Could not encode a blank fixture.")
    return encoded.tobytes()


def _write(data: bytes) -> Path:
    path = Path(database.image_dir()) / "fixture.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


class QrScanTests(DataDirTest):
    def test_readable_url_is_exact(self) -> None:
        payload = "https://example.com/register?id=42"
        codes = scan_image(_write(qr_png(payload)))
        self.assertEqual([(code.payload, code.readable) for code in codes], [(payload, True)])

    def test_multiple_codes_are_deduped(self) -> None:
        first = "https://club.example/meet"
        second = "https://club.example/board"
        codes = scan_image(_write(qr_png(first, second, first)))
        self.assertEqual(sorted(code.payload for code in codes), sorted([first, second]))

    def test_non_url_payload_stays_text(self) -> None:
        payload = "bring-snacks"
        codes = scan_image(_write(qr_png(payload)))
        self.assertEqual(codes[0].payload, payload)
        self.assertTrue(codes[0].readable)
        from app.qr import is_http_url

        self.assertFalse(is_http_url(codes[0].payload))
        from app.qr import is_clickable_link

        self.assertFalse(is_clickable_link(codes[0].payload))

    def test_mailto_payload_stays_exact(self) -> None:
        payload = "mailto:person@example.com?subject=Hello"
        codes = scan_image(_write(qr_png(payload)))
        self.assertEqual(codes[0].payload, payload)
        from app.qr import is_clickable_link, is_http_url, mailto_address

        self.assertFalse(is_http_url(payload))
        self.assertTrue(is_clickable_link(payload))
        self.assertEqual(mailto_address(payload), "person@example.com")

    def test_photographed_code_is_stored_exactly(self) -> None:
        payload = "https://photos.example/meet?id=7"
        image = photographed_jpeg(payload)
        codes = scan_image(_write(image))
        self.assertEqual([(code.payload, code.readable) for code in codes], [(payload, True)])
        database.init_db()
        row = database.insert_screenshot(
            original_filename="photo.jpg",
            extension=".jpg",
            media_type="image/jpeg",
            ocr_text="Meet on Friday.",
            data=image,
        )
        database.replace_qr_codes(
            row["id"],
            [(code.payload, code.readable) for code in scan_image(database.image_dir() / row["stored_name"])],
        )
        self.assertEqual(database.list_qr_codes(row["id"])[0]["payload"], payload)

    def test_unreadable_code_is_reported(self) -> None:
        from app.qr import QrCode, _readings, dedupe_codes

        codes = scan_image(_write(qr_png("https://example.com/tiny", scale=1)))
        self.assertTrue(codes)
        self.assertFalse(codes[0].readable)
        self.assertEqual(codes[0].payload, "")
        noted = dedupe_codes([QrCode(payload="", readable=False), QrCode(payload="", readable=False)])
        self.assertEqual(noted, [QrCode(payload="", readable=False)])
        self.assertEqual(_readings(("",), object())[0].readable, False)

    def test_image_without_a_qr_code(self) -> None:
        self.assertEqual(scan_image(_write(blank_png())), [])
        self.assertEqual(scan_image(_write(sample_png("Apply by Friday"))), [])

    def test_detector_failure_returns_no_codes(self) -> None:
        path = _write(blank_png())
        with patch("cv2.QRCodeDetector") as detector:
            detector.return_value.detectAndDecodeMulti.side_effect = RuntimeError("detector down")
            self.assertEqual(scan_image(path), [])

    def test_codes_persist_exactly(self) -> None:
        payload = "https://example.com/register?id=42"
        database.init_db()
        row = database.insert_screenshot(
            original_filename="qr.png",
            extension=".png",
            media_type="image/png",
            ocr_text="Register for the workshop.",
            data=qr_png(payload),
        )
        database.replace_qr_codes(row["id"], [(code.payload, code.readable) for code in scan_image(database.image_dir() / row["stored_name"])])
        stored = database.list_qr_codes(row["id"])
        self.assertEqual(stored[0]["payload"], payload)
        self.assertEqual(database.list_qr_codes(row["id"])[0]["payload"], payload)


class QrAssociationTests(DataDirTest):
    def test_one_registration_code_uses_the_exact_url(self) -> None:
        url = "https://club.example/register"
        item = ExtractedItem(
            title="Workshop",
            category=Category.CAMPUS_EVENTS,
            supporting_text="Register for the workshop.",
            tasks=[
                ExtractedTask(
                    title="Register for the workshop",
                    supporting_text="Register for the workshop.",
                    kind=ActionKind.EXPLICIT,
                )
            ],
        )
        linked = associate_qr_links([item], [url])[0]
        self.assertEqual(linked.tasks[0].link_url, url)
        self.assertEqual(linked.tasks[0].link_label, "Registration link")
        self.assertEqual(linked.registration_url, url)

    def test_multiple_codes_are_left_for_the_user(self) -> None:
        item = ExtractedItem(
            title="Workshop",
            category=Category.CAMPUS_EVENTS,
            supporting_text="Register for the workshop.",
            tasks=[
                ExtractedTask(
                    title="Register for the workshop",
                    supporting_text="Register for the workshop.",
                )
            ],
        )
        linked = associate_qr_links(
            [item],
            ["https://club.example/register", "https://club.example/map"],
        )[0]
        self.assertIsNone(linked.tasks[0].link_url)
        self.assertIsNone(linked.registration_url)

    def test_model_cannot_rewrite_a_qr_url(self) -> None:
        ocr = "Register for the workshop.\nBring a resume."
        url = "https://club.example/register"
        payload = {
            "title": "Workshop",
            "category": "Campus events",
            "items": [
                {
                    "title": "Workshop",
                    "category": "Campus events",
                    "supporting_text": "Register for the workshop.",
                    "registration_url": "https://evil.example/phish",
                    "tasks": [
                        {
                            "title": "Register for the workshop",
                            "supporting_text": "Register for the workshop.",
                            "kind": "explicit",
                        }
                    ],
                }
            ],
        }
        item = apply_model_payload(payload, ocr, [url]).items[0]
        dumped = str(item.model_dump())
        self.assertNotIn("evil.example", dumped)
        self.assertEqual(item.tasks[0].link_url, url)
        self.assertEqual(item.registration_url, url)


class QrApiTests(DataDirTest):
    def setUp(self) -> None:
        super().setUp()
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        super().tearDown()

    def test_import_keeps_the_exact_link_after_reload(self) -> None:
        payload = "https://example.com/register?id=42"
        with patch("app.main.ocr.extract_text", return_value="Register for the workshop."):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("qr.png", qr_png(payload), "image/png")},
            )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        shot = uploaded.json()["screenshot"]
        self.assertEqual(shot["qr_codes"][0]["payload"], payload)
        self.assertEqual(shot["qr_codes"][0]["domain"], "example.com")
        self.assertTrue(shot["qr_codes"][0]["is_url"])
        reloaded = self.client.get(f"/api/screenshots/{shot['id']}")
        self.assertEqual(reloaded.status_code, 200)
        self.assertEqual(reloaded.json()["qr_codes"][0]["payload"], payload)

    def test_mailto_import_is_clickable_and_exact(self) -> None:
        payload = "mailto:person@example.com"
        with patch("app.main.ocr.extract_text", return_value="Email me a resume."):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("mail.png", qr_png(payload), "image/png")},
            )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        code = uploaded.json()["screenshot"]["qr_codes"][0]
        self.assertEqual(code["payload"], payload)
        self.assertTrue(code["is_url"])
        self.assertEqual(code["domain"], "person@example.com")
        self.assertNotIn("https://", code["payload"])

    def test_photographed_import_keeps_the_exact_link(self) -> None:
        payload = "https://photos.example/meet?id=7"
        with patch("app.main.ocr.extract_text", return_value="Meet on Friday."):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("photo.jpg", photographed_jpeg(payload), "image/jpeg")},
            )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        code = uploaded.json()["screenshot"]["qr_codes"][0]
        self.assertEqual(code["payload"], payload)
        self.assertEqual(code["domain"], "photos.example")
        self.assertTrue(code["is_url"])

    def test_unreadable_code_adds_a_note_and_blank_image_has_none(self) -> None:
        with patch("app.main.ocr.extract_text", return_value="Register for the workshop."):
            tiny = self.client.post(
                "/api/screenshots",
                files={"file": ("tiny.png", qr_png("https://example.com/tiny", scale=1), "image/png")},
            )
            empty = self.client.post(
                "/api/screenshots",
                files={"file": ("blank.png", blank_png(), "image/png")},
            )
        self.assertEqual(tiny.status_code, 200, tiny.text)
        unreadable = tiny.json()["screenshot"]
        self.assertEqual(unreadable["qr_codes"][0]["readable"], False)
        self.assertEqual(unreadable["qr_codes"][0]["payload"], "")
        self.assertEqual(unreadable["qr_note"], UNREADABLE_NOTE)
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["screenshot"]["qr_codes"], [])

    def test_chosen_link_survives_approval_and_a_rewritten_url_does_not(self) -> None:
        payload = "https://example.com/register?id=42"
        from app.extractor import ExtractionOutcome

        outcome = ExtractionOutcome(
            items=[
                ExtractedItem(
                    title="Workshop",
                    category=Category.CAMPUS_EVENTS,
                    supporting_text="Register for the workshop.",
                    tasks=[
                        ExtractedTask(
                            title="Register for the workshop",
                            due_date=date(2026, 10, 18),
                            supporting_text="Register for the workshop.",
                        )
                    ],
                )
            ],
            dropped_ungrounded=0,
        )
        with (
            patch("app.main.ocr.extract_text", return_value="Register for the workshop."),
            patch("app.main.extractor.extract_items", return_value=outcome),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("qr.png", qr_png(payload), "image/png")},
            )
            shot_id = uploaded.json()["screenshot"]["id"]
            interpreted = self.client.post(f"/api/screenshots/{shot_id}/interpret")
        task_id = interpreted.json()["screenshot"]["items"][0]["tasks"][0]["id"]
        item_id = interpreted.json()["screenshot"]["items"][0]["id"]
        rejected = self.client.post(
            f"/api/screenshots/{shot_id}/approve",
            json={
                "title": "Workshop",
                "category": "Campus events",
                "task_ids": [task_id],
                "tasks": [{"id": task_id, "title": "Register for the workshop", "link_url": "https://evil.example/phish"}],
                "items": [{"id": item_id, "title": "Workshop"}],
            },
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)
        kept = rejected.json()["screenshot"]["items"][0]["tasks"][0]
        self.assertIsNone(kept["link_url"])
        saved = self.client.post(
            f"/api/screenshots/{shot_id}/approve",
            json={
                "title": "Workshop",
                "category": "Campus events",
                "task_ids": [task_id],
                "tasks": [
                    {
                        "id": task_id,
                        "title": "Register for the workshop",
                        "link_url": payload,
                        "link_label": "Registration link",
                    }
                ],
                "items": [{"id": item_id, "title": "Workshop"}],
            },
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        reloaded = self.client.get(f"/api/screenshots/{shot_id}")
        task = reloaded.json()["items"][0]["tasks"][0]
        self.assertEqual(task["link_url"], payload)
        self.assertEqual(task["link_label"], "Registration link")
        self.assertEqual(reloaded.json()["qr_codes"][0]["payload"], payload)

    def test_qr_failure_does_not_block_ocr(self) -> None:
        with (
            patch("app.main.ocr.extract_text", return_value="Register for the workshop."),
            patch("app.qr.scan_image", side_effect=RuntimeError("detector down")),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("note.png", sample_png("Register for the workshop."), "image/png")},
            )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        self.assertIn("Register", uploaded.json()["screenshot"]["ocr_text"])
        self.assertEqual(uploaded.json()["screenshot"]["qr_codes"], [])
