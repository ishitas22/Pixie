from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import database
from app.extractor import ExtractionFailed, ExtractionOutcome, OllamaUnavailable
from app.main import app
from app.ocr import OcrEngineError
from app.schemas import Category, ExtractedItem, ExtractedTask
from tests.support import DataDirTest, sample_heic, sample_jpeg, sample_png


class ApiTests(DataDirTest):
    def setUp(self) -> None:
        super().setUp()
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        super().tearDown()

    def test_cors_allows_the_local_frontend_only(self) -> None:
        allowed = self.client.get("/api/tasks", headers={"Origin": "http://localhost:8081"})
        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://localhost:8081")
        blocked = self.client.get("/api/tasks", headers={"Origin": "https://evil.example"})
        self.assertNotEqual(blocked.headers.get("access-control-allow-origin"), "https://evil.example")

    def test_health_reports_mocked_services(self) -> None:
        with (
            patch("app.main.ocr.check_tesseract", return_value=(True, "Tesseract 5 is ready.")),
            patch("app.main.extractor.check_ollama", return_value=(False, "Ollama is not running.")),
        ):
            response = self.client.get("/api/health")
        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(body["ok"])
        self.assertEqual(body["categories"][0], "Campus events")
        self.assertIn("Ollama", body["ollama"]["message"])

    def test_import_returns_editable_suggestions_and_accepts_them(self) -> None:
        outcome = ExtractionOutcome(
            items=[
                ExtractedItem(
                    title="Campus Career Fair",
                    summary="Employers on campus",
                    category=Category.CAREER,
                    supporting_text="Apply by 2026-10-10",
                    event_date=date(2026, 10, 24),
                    event_date_text="Career fair on 2026-10-24",
                    location="Student Center",
                    tasks=[
                        ExtractedTask(
                            title="Reserve a resume review",
                            due_date=date(2026, 10, 10),
                            supporting_text="Apply by 2026-10-10",
                        )
                    ],
                )
            ],
            dropped_ungrounded=1,
        )
        with (
            patch("app.main.ocr.extract_text", return_value="Apply by 2026-10-10\nCareer fair on 2026-10-24 at the Student Center"),
            patch("app.main.extractor.extract_items", return_value=outcome),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("fair.png", sample_png("Apply by 2026-10-10"), "image/png")},
            )
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            self.assertEqual(uploaded.json()["screenshot"]["processing_status"], "ocr_complete")
            self.assertEqual(uploaded.json()["screenshot"]["items"], [])
            imported = self.client.post(f"/api/screenshots/{uploaded.json()['screenshot']['id']}/interpret")
        self.assertEqual(imported.status_code, 200, imported.text)
        body = imported.json()
        self.assertIn("Apply by 2026-10-10", body["screenshot"]["ocr_text"])
        item = body["screenshot"]["items"][0]
        self.assertEqual(item["event"]["event_date"], "2026-10-24")
        self.assertEqual(item["tasks"][0]["deadline"], "2026-10-10")
        self.assertEqual(item["tasks"][0]["status"], "suggested")
        self.assertEqual(self.client.get("/api/tasks").json(), [])
        self.assertIn("not supported", body["notice"])

        accepted = self.client.post(
            "/api/tasks",
            json={
                "screenshot_id": body["screenshot"]["id"],
                "tasks": [
                    {
                        "title": "Reserve a resume review",
                        "details": "Edited detail",
                        "category": "Career Opportunities",
                        "deadline": "2026-10-10",
                        "supporting_text": "Apply by 2026-10-10",
                    }
                ],
            },
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        task_id = accepted.json()["tasks"][0]["id"]
        self.assertEqual(accepted.json()["tasks"][0]["screenshot_id"], body["screenshot"]["id"])

        completed = self.client.patch(f"/api/tasks/{task_id}", json={"completed": True})
        self.assertTrue(completed.json()["completed"])

        with TestClient(app) as reloaded:
            tasks = reloaded.get("/api/tasks")
        self.assertEqual(tasks.status_code, 200)
        self.assertEqual(tasks.json()[0]["id"], task_id)
        self.assertTrue(tasks.json()[0]["completed"])
        image = self.client.get(body["screenshot"]["image_url"])
        self.assertEqual(image.status_code, 200)
        self.assertTrue(image.content.startswith(b"\x89PNG"))

    def test_model_failure_keeps_the_screenshot_and_ocr(self) -> None:
        with (
            patch("app.main.ocr.extract_text", return_value="Apply by 2026-11-01 for the lab role"),
            patch("app.main.extractor.extract_items", side_effect=ExtractionFailed("The model could not extract items.")),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("lab.png", sample_png(), "image/png")},
            )
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            response = self.client.post(f"/api/screenshots/{uploaded.json()['screenshot']['id']}/interpret")
        self.assertEqual(response.status_code, 502)
        body = response.json()
        self.assertEqual(body["error"], "model_extraction_failed")
        self.assertIn("Interpretation failed", body["message"])
        self.assertEqual(body["screenshot"]["processing_status"], "model_failed")
        self.assertIn("Apply by 2026-11-01", body["screenshot"]["ocr_text"])
        image = self.client.get(body["screenshot"]["image_url"])
        self.assertEqual(image.status_code, 200)
        self.assertEqual(self.client.get("/api/tasks").json(), [])

    def test_ollama_unavailable_keeps_the_screenshot(self) -> None:
        with (
            patch("app.main.ocr.extract_text", return_value="Submit the form by Friday"),
            patch(
                "app.main.extractor.extract_items",
                side_effect=OllamaUnavailable("Ollama is not running at http://127.0.0.1:11434."),
            ),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("form.jpg", sample_jpeg(), "image/jpeg")},
            )
            response = self.client.post(f"/api/screenshots/{uploaded.json()['screenshot']['id']}/interpret")
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["error"], "ollama_unavailable")
        self.assertIn("Ollama", body["message"])
        self.assertIn("Submit the form", body["screenshot"]["ocr_text"])

    def test_no_readable_text_does_not_call_the_model(self) -> None:
        with (
            patch("app.main.ocr.extract_text", return_value="   \n"),
            patch("app.main.extractor.extract_items") as extract,
        ):
            response = self.client.post(
                "/api/screenshots",
                files={"file": ("blank.png", sample_png(), "image/png")},
            )
        extract.assert_not_called()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"], "no_readable_text")
        self.assertIn("screenshot", response.json())

    def test_ocr_engine_failure_keeps_the_file(self) -> None:
        with patch("app.main.ocr.extract_text", side_effect=OcrEngineError("Tesseract could not read this screenshot.")):
            response = self.client.post(
                "/api/screenshots",
                files={"file": ("bad.png", sample_png(), "image/png")},
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["error"], "ocr_failed")
        self.assertEqual(self.client.get(response.json()["screenshot"]["image_url"]).status_code, 200)

    def test_rejects_non_image_and_oversized_uploads(self) -> None:
        rejected = self.client.post(
            "/api/screenshots",
            files={"file": ("notes.txt", b"hello", "text/plain")},
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(rejected.json()["error"], "unsupported_type")
        huge = b"\x89PNG\r\n\x1a\n" + (b"0" * (8 * 1024 * 1024))
        oversized = self.client.post("/api/screenshots", files={"file": ("big.png", huge, "image/png")})
        self.assertEqual(oversized.status_code, 413)
        self.assertEqual(oversized.json()["error"], "file_too_large")

    def test_heic_upload_is_stored_as_jpeg_with_the_original_name(self) -> None:
        payload = sample_heic("Apply by 2026-10-10")
        with patch("app.main.ocr.extract_text", return_value="Apply by 2026-10-10"):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("Vacation.HEIC", payload, "image/heic")},
            )
            octet = self.client.post(
                "/api/screenshots",
                files={"file": ("IMG_0002.heif", payload, "application/octet-stream")},
            )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        body = uploaded.json()
        self.assertEqual(body["screenshot"]["filename"], "Vacation.HEIC")
        image = self.client.get(body["screenshot"]["image_url"])
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image.headers["content-type"], "image/jpeg")
        self.assertTrue(image.content.startswith(b"\xff\xd8\xff"))
        row = database.get_screenshot(body["screenshot"]["id"])
        assert row is not None
        self.assertTrue(row["stored_name"].endswith(".jpg"))
        self.assertEqual(row["original_filename"], "Vacation.HEIC")
        self.assertEqual(octet.status_code, 200, octet.text)
        self.assertEqual(octet.json()["screenshot"]["filename"], "IMG_0002.heif")
        fake = self.client.post(
            "/api/screenshots",
            files={"file": ("notes.heic", b"\x00\x00\x00\x18ftypheic" + b"bogus", "application/octet-stream")},
        )
        self.assertEqual(fake.status_code, 400)
        self.assertEqual(fake.json()["error"], "invalid_image")

    def test_invalid_deadline_is_rejected_on_accept(self) -> None:
        with (
            patch("app.main.ocr.extract_text", return_value="Club meeting on Thursday"),
            patch(
                "app.main.extractor.extract_items",
                return_value=ExtractionOutcome(items=[], dropped_ungrounded=0),
            ),
        ):
            imported = self.client.post(
                "/api/screenshots",
                files={"file": ("club.png", sample_png(), "image/png")},
            )
        response = self.client.post(
            "/api/tasks",
            json={
                "screenshot_id": imported.json()["screenshot"]["id"],
                "tasks": [
                    {
                        "title": "Go to the meeting",
                        "details": "",
                        "category": "Campus events",
                        "deadline": "next friday",
                        "supporting_text": "Club meeting on Thursday",
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/api/tasks").json(), [])

    def test_confirm_calendar_and_queries_do_not_duplicate(self) -> None:
        fair = ExtractedItem(
            title="Campus Career Fair",
            summary="Employers on campus",
            category=Category.CAREER,
            supporting_text="Campus Career Fair",
            event_date=date(2026, 10, 17),
            location="Student Center",
            tasks=[
                ExtractedTask(
                    title="Apply for the resume review",
                    due_date=date(2026, 10, 16),
                    supporting_text="Apply by 2026-10-16",
                )
            ],
        )
        concert = ExtractedItem(
            title="Spring Concert",
            summary=None,
            category=Category.CAMPUS_EVENTS,
            supporting_text="Spring Concert",
            event_date=date(2026, 10, 18),
            location="the quad",
            tasks=[],
        )
        with (
            patch("app.main.ocr.extract_text", return_value="Campus Career Fair\nSpring Concert"),
            patch("app.main.extractor.extract_items", return_value=ExtractionOutcome(items=[fair, concert], dropped_ungrounded=0)),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("two.png", sample_png(), "image/png")},
            )
            imported = self.client.post(f"/api/screenshots/{uploaded.json()['screenshot']['id']}/interpret")
        self.assertEqual(imported.status_code, 200, imported.text)
        shot = imported.json()["screenshot"]
        self.assertEqual(len(shot["items"]), 2)
        career = next(item for item in shot["items"] if item["title"] == "Campus Career Fair")
        campus = next(item for item in shot["items"] if item["title"] == "Spring Concert")

        blocked = self.client.post(f"/api/items/{career['id']}/calendar", json={"on_calendar": True})
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.json()["error"], "needs_confirmation")

        confirmed = self.client.post(f"/api/items/{career['id']}/confirm")
        again = self.client.post(f"/api/items/{career['id']}/confirm")
        self.assertEqual(confirmed.json()["review_status"], "confirmed")
        self.assertEqual(again.json()["id"], career["id"])
        self.assertEqual(again.json()["confirmed_at"], confirmed.json()["confirmed_at"])

        added = self.client.post(f"/api/items/{career['id']}/calendar", json={"on_calendar": True})
        added_again = self.client.post(f"/api/items/{career['id']}/calendar", json={"on_calendar": True})
        self.assertTrue(added.json()["event"]["on_calendar"])
        self.assertTrue(added_again.json()["event"]["on_calendar"])
        detail = self.client.get(f"/api/screenshots/{shot['id']}")
        self.assertEqual(len(detail.json()["items"]), 2)

        undated = self.client.post(
            f"/api/screenshots/{shot['id']}/items",
            json={"title": "Library errand", "category": "Personal", "supporting_text": "Library errand"},
        )
        self.assertEqual(undated.status_code, 200, undated.text)
        self.client.post(f"/api/items/{undated.json()['id']}/confirm")
        no_date = self.client.post(f"/api/items/{undated.json()['id']}/calendar", json={"on_calendar": True})
        self.assertEqual(no_date.json()["error"], "needs_event_date")

        accepted = self.client.patch(
            f"/api/tasks/{career['tasks'][0]['id']}",
            json={"status": "accepted"},
        )
        accepted_again = self.client.post(
            f"/api/items/{career['id']}/tasks",
            json={"title": "Apply for the resume review", "supporting_text": "Apply by 2026-10-16"},
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted_again.json()["id"], career["tasks"][0]["id"])
        self.assertEqual(len(self.client.get("/api/tasks").json()), 1)

        self.client.post(f"/api/items/{campus['id']}/confirm")
        self.client.post(f"/api/items/{campus['id']}/calendar", json={"on_calendar": True})
        edited = self.client.patch(
            f"/api/items/{campus['id']}",
            json={"category": "Extracurriculars", "location": "the quad"},
        )
        self.assertEqual(edited.json()["category"], "Extracurriculars")

        gallery = self.client.get("/api/screenshots", params={"category": "Career Opportunities"})
        self.assertEqual([row["id"] for row in gallery.json()], [shot["id"]])
        other = self.client.get("/api/screenshots", params={"category": "Other"})
        self.assertEqual(other.json(), [])

        with patch("app.main.local_today", return_value=date(2026, 10, 17)):
            board = self.client.get("/api/dashboard", params={"timezone": "America/New_York"})
        self.assertEqual(board.status_code, 200, board.text)
        body = board.json()
        self.assertEqual(body["today_date"], "2026-10-17")
        self.assertEqual([row["title"] for row in body["today_events"]], ["Campus Career Fair"])
        self.assertEqual([row["title"] for row in body["upcoming_events"]], ["Spring Concert"])
        self.assertEqual([row["title"] for row in body["overdue_tasks"]], ["Apply for the resume review"])
        self.assertEqual(body["needs_review"], [])
        window = self.client.get("/api/calendar", params={"start": "2026-10-17", "end": "2026-10-17"})
        self.assertEqual([row["title"] for row in window.json()], ["Campus Career Fair"])

        revised = self.client.patch(f"/api/items/{career['id']}", json={"summary": "User edited this summary"})
        self.assertEqual(revised.json()["summary"], "User edited this summary")
        replacement = ExtractedItem(
            title="Different concert",
            summary="A new reading",
            category=Category.CAMPUS_EVENTS,
            supporting_text="Different concert",
            event_date=date(2026, 12, 1),
            tasks=[],
        )
        with (
            patch("app.main.ocr.extract_text", return_value="Campus Career Fair\nDifferent concert"),
            patch(
                "app.main.extractor.extract_items",
                return_value=ExtractionOutcome(items=[replacement], dropped_ungrounded=0),
            ),
        ):
            reread = self.client.post(f"/api/screenshots/{shot['id']}/reanalyze")
            self.assertEqual(reread.status_code, 200, reread.text)
            again = self.client.post(f"/api/screenshots/{shot['id']}/interpret")
        self.assertEqual(again.status_code, 200, again.text)
        kept = {item["title"]: item for item in again.json()["screenshot"]["items"]}
        self.assertEqual(kept["Campus Career Fair"]["summary"], "User edited this summary")
        self.assertIn("Different concert", kept)
        self.assertIn("Spring Concert", kept)

        removed = self.client.post(f"/api/items/{career['id']}/calendar", json={"on_calendar": False})
        self.assertFalse(removed.json()["event"]["on_calendar"])
        with patch("app.main.local_today", return_value=date(2026, 10, 17)):
            after = self.client.get("/api/dashboard")
        self.assertEqual(after.json()["today_events"], [])

    def test_approval_saves_the_generated_title_and_only_selected_tasks(self) -> None:
        outcome = ExtractionOutcome(
            items=[
                ExtractedItem(
                    title="Hack Like W@CC 2026",
                    summary=None,
                    category=Category.EXTRACURRICULARS,
                    supporting_text="Hack Like W@CC 2026",
                    event_date=date(2026, 10, 17),
                    location="Klaus Atrium",
                    tasks=[
                        ExtractedTask(
                            title="Attend Hack Like W@CC 2026",
                            supporting_text="Hack Like W@CC 2026",
                            kind="suggestion",
                        ),
                        ExtractedTask(
                            title="Register for the hackathon",
                            due_date=date(2026, 10, 10),
                            supporting_text="Register by 2026-10-10",
                        ),
                    ],
                )
            ],
            dropped_ungrounded=0,
            title="Hack Like W@CC 2026",
            category=Category.EXTRACURRICULARS,
        )
        with (
            patch("app.main.ocr.extract_text", return_value="Hack Like W@CC 2026\nRegister by 2026-10-10"),
            patch("app.main.extractor.extract_items", return_value=outcome),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("IMG_2742.PNG", sample_png("Hack Like W@CC 2026"), "image/png")},
            )
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            screenshot_id = uploaded.json()["screenshot"]["id"]
            self.assertEqual(self.client.get("/api/tasks").json(), [])
            interpreted = self.client.post(f"/api/screenshots/{screenshot_id}/interpret")
        self.assertEqual(interpreted.status_code, 200, interpreted.text)
        shot = interpreted.json()["screenshot"]
        self.assertEqual(shot["filename"], "IMG_2742.PNG")
        self.assertEqual(shot["display_title"], "Hack Like W@CC 2026")
        self.assertEqual(shot["category"], "Extracurriculars")
        self.assertNotEqual(shot["display_title"], shot["ocr_text"])
        self.assertEqual(shot["image_url"], f"/api/screenshots/{screenshot_id}/image")
        titles = [task["title"] for item in shot["items"] for task in item["tasks"]]
        self.assertNotIn("Add to Google Calendar", titles)
        self.assertEqual(self.client.get("/api/tasks").json(), [])
        gallery = self.client.get("/api/screenshots")
        self.assertEqual(gallery.json()[0]["title"], "Hack Like W@CC 2026")
        self.assertNotEqual(gallery.json()[0]["title"], "IMG_2742.PNG")

        register = next(task for task in shot["items"][0]["tasks"] if task["title"] == "Register for the hackathon")
        attend = next(task for task in shot["items"][0]["tasks"] if task["title"].startswith("Attend"))
        approved = self.client.post(
            f"/api/screenshots/{screenshot_id}/approve",
            json={
                "title": "Hack Like W@CC 2026",
                "category": "Extracurriculars",
                "task_ids": [register["id"]],
                "items": [{"id": shot["items"][0]["id"], "location": "Klaus Atrium"}],
            },
        )
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["screenshot"]["display_title"], "Hack Like W@CC 2026")
        listed = self.client.get("/api/tasks").json()
        self.assertEqual([task["title"] for task in listed], ["Register for the hackathon"])
        self.assertEqual(listed[0]["source_title"], "Hack Like W@CC 2026")
        self.assertNotEqual(listed[0]["deadline"], "2026-10-17")
        again = self.client.post(
            f"/api/screenshots/{screenshot_id}/approve",
            json={
                "title": "Hack Like W@CC 2026",
                "category": "Extracurriculars",
                "task_ids": [register["id"], attend["id"]],
            },
        )
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(
            sorted(task["title"] for task in self.client.get("/api/tasks").json()),
            ["Attend Hack Like W@CC 2026", "Register for the hackathon"],
        )
        repeated = self.client.post(
            f"/api/screenshots/{screenshot_id}/approve",
            json={
                "title": "Hack Like W@CC 2026",
                "category": "Extracurriculars",
                "task_ids": [register["id"], attend["id"]],
            },
        )
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(len(self.client.get("/api/tasks").json()), 2)

        with TestClient(app) as reloaded:
            detail = reloaded.get(f"/api/screenshots/{screenshot_id}")
            tasks = reloaded.get("/api/tasks")
        self.assertEqual(detail.json()["display_title"], "Hack Like W@CC 2026")
        self.assertEqual(detail.json()["category"], "Extracurriculars")
        self.assertEqual(len(tasks.json()), 2)
        self.assertEqual(tasks.json()[0]["source_title"], "Hack Like W@CC 2026")

    def test_save_without_tasks_keeps_a_category_and_an_empty_task_list(self) -> None:
        outcome = ExtractionOutcome(
            items=[],
            dropped_ungrounded=0,
            title="Dorm window sunset",
            category=Category.OTHER,
        )
        with (
            patch("app.main.ocr.extract_text", return_value="Just a photo of the sunset from the dorm window."),
            patch("app.main.extractor.extract_items", return_value=outcome),
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("IMG_0001.PNG", sample_png(), "image/png")},
            )
            screenshot_id = uploaded.json()["screenshot"]["id"]
            interpreted = self.client.post(f"/api/screenshots/{screenshot_id}/interpret")
        self.assertEqual(interpreted.status_code, 200, interpreted.text)
        self.assertEqual(interpreted.json()["screenshot"]["items"], [])
        self.assertEqual(self.client.get("/api/tasks").json(), [])
        saved = self.client.post(
            f"/api/screenshots/{screenshot_id}/approve",
            json={"title": "Dorm window sunset", "category": "Other", "task_ids": []},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["screenshot"]["display_title"], "Dorm window sunset")
        self.assertEqual(saved.json()["screenshot"]["category"], "Other")
        self.assertEqual(self.client.get("/api/tasks").json(), [])
        gallery = self.client.get("/api/screenshots", params={"category": "Other"})
        self.assertEqual(gallery.json()[0]["title"], "Dorm window sunset")
        with TestClient(app) as reloaded:
            detail = reloaded.get(f"/api/screenshots/{screenshot_id}")
        self.assertEqual(detail.json()["display_title"], "Dorm window sunset")
        self.assertEqual(detail.json()["category"], "Other")

    def test_reanalyze_reruns_the_model_and_keeps_an_approved_title(self) -> None:
        first = ExtractionOutcome(
            items=[
                ExtractedItem(
                    title="Old reading",
                    category=Category.CAMPUS_EVENTS,
                    supporting_text="Old reading",
                    tasks=[
                        ExtractedTask(title="Register for the workshop", supporting_text="Old reading"),
                    ],
                )
            ],
            dropped_ungrounded=0,
            title="Old reading",
            category=Category.CAMPUS_EVENTS,
        )
        second = ExtractionOutcome(
            items=[
                ExtractedItem(
                    title="New reading",
                    category=Category.PERSONAL,
                    supporting_text="New reading",
                    tasks=[],
                )
            ],
            dropped_ungrounded=0,
            title="New reading",
            category=Category.PERSONAL,
        )
        with (
            patch("app.main.ocr.extract_text", return_value="Old reading\nNew reading"),
            patch("app.main.extractor.extract_items", side_effect=[first, second]) as extract,
        ):
            uploaded = self.client.post(
                "/api/screenshots",
                files={"file": ("notes.png", sample_png(), "image/png")},
            )
            screenshot_id = uploaded.json()["screenshot"]["id"]
            interpreted = self.client.post(f"/api/screenshots/{screenshot_id}/interpret")
            self.assertEqual(interpreted.json()["screenshot"]["display_title"], "Old reading")
            task_id = interpreted.json()["screenshot"]["items"][0]["tasks"][0]["id"]
            self.assertEqual(self.client.get("/api/tasks").json(), [])
            self.client.post(
                f"/api/screenshots/{screenshot_id}/approve",
                json={"title": "Old reading", "category": "Campus events", "task_ids": [task_id]},
            )
            reread = self.client.post(f"/api/screenshots/{screenshot_id}/reanalyze")
            self.assertEqual(reread.status_code, 200, reread.text)
            self.assertEqual(reread.json()["screenshot"]["display_title"], "Old reading")
            again = self.client.post(f"/api/screenshots/{screenshot_id}/interpret")
        self.assertEqual(extract.call_count, 2)
        body = again.json()["screenshot"]
        self.assertEqual(body["display_title"], "Old reading")
        self.assertEqual(body["draft_title"], "New reading")
        self.assertEqual(body["category"], "Campus events")
        self.assertIn("New reading", {item["title"] for item in body["items"]})
        self.assertEqual([task["title"] for task in self.client.get("/api/tasks").json()], ["Register for the workshop"])
        self.assertEqual(self.client.get("/api/tasks").json()[0]["source_title"], "Old reading")
