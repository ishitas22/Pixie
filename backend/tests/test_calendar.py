"""Task-deadline calendar and Google Calendar prefill links. No live Google account."""

import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient

from app.calendar_view import is_task_overdue, month_grid, split_task_calendar
from app.dates import local_today
from app.extractor import ExtractionOutcome
from app.google_calendar import GoogleCalendarError, google_calendar_url
from app.main import app
from app.schemas import Category, ExtractedItem, ExtractedTask
from tests.support import DataDirTest, sample_png

OCR = "SECRET_OCR_SENTENCE about the flyer on disk"
STORED_PATH = r"C:\Users\ishit\pixie\backend\data\images\not-a-real-file.png"


def query_params(url: str) -> dict[str, str]:
    parts = urlsplit(url)
    parsed = parse_qs(parts.query, keep_blank_values=True)
    return {key: values[0] for key, values in parsed.items()}


class GoogleCalendarUrlTests(unittest.TestCase):
    def test_complete_event_encodes_title_start_and_location_without_ocr_or_paths(self) -> None:
        url = google_calendar_url(
            title="Café & Q&A #1 — 日本語",
            event_date=date(2026, 10, 25),
            start_time="14:00",
            end_time="15:30",
            timezone_name="America/New_York",
            location="Room 5 & hall #2 — café",
            summary="A short summary",
            category="Campus events",
        )
        params = query_params(url)
        self.assertEqual(params["action"], "TEMPLATE")
        self.assertEqual(params["text"], "Café & Q&A #1 — 日本語")
        self.assertEqual(params["dates"], "20261025T140000/20261025T153000")
        self.assertEqual(params["ctz"], "America/New_York")
        self.assertEqual(params["location"], "Room 5 & hall #2 — café")
        self.assertIn("A short summary", params["details"])
        self.assertIn("Campus events", params["details"])
        self.assertNotIn(OCR, url)
        self.assertNotIn(STORED_PATH, url)
        self.assertNotIn("/api/screenshots", url)
        self.assertNotIn(".png", url)
        parts = urlsplit(url)
        self.assertEqual(parts.fragment, "")
        self.assertIn("%26", url)
        self.assertIn("%23", url)
        self.assertNotIn("#", parts.query)

    def test_missing_end_time_does_not_emit_a_url_until_one_is_supplied(self) -> None:
        with self.assertRaises(GoogleCalendarError) as caught:
            google_calendar_url(
                title="Studio hours",
                event_date=date(2026, 10, 25),
                start_time="14:00",
                end_time=None,
                location="Studio 4",
                category="Campus events",
            )
        self.assertEqual(caught.exception.code, "needs_end_time")
        url = google_calendar_url(
            title="Studio hours",
            event_date=date(2026, 10, 25),
            start_time="14:00",
            end_time="15:00",
            location="Studio 4",
            category="Campus events",
        )
        self.assertEqual(query_params(url)["dates"], "20261025T140000/20261025T150000")
        self.assertNotIn("suggested", url.casefold())

    def test_multi_day_event_uses_the_real_end_date(self) -> None:
        url = google_calendar_url(
            title="Hackathon",
            event_date=date(2026, 10, 25),
            start_time="09:00",
            end_date=date(2026, 10, 26),
            end_time="17:00",
            location="https://meet.example/room",
            category="Extracurriculars",
        )
        params = query_params(url)
        self.assertEqual(params["dates"], "20261025T090000/20261026T170000")
        self.assertEqual(params["location"], "https://meet.example/room")
        self.assertEqual(params["ctz"], "America/New_York")

    def test_missing_location_and_date_are_distinct(self) -> None:
        with self.assertRaises(GoogleCalendarError) as missing_date:
            google_calendar_url(title="Talk", event_date=None, start_time="10:00", end_time="11:00", location="Hall")
        self.assertEqual(missing_date.exception.code, "needs_event_date")
        with self.assertRaises(GoogleCalendarError) as missing_place:
            google_calendar_url(
                title="Talk",
                event_date=date(2026, 10, 25),
                start_time="10:00",
                end_time="11:00",
                location=None,
            )
        self.assertEqual(missing_place.exception.code, "needs_location")


class MonthGridTests(unittest.TestCase):
    def test_october_2026_starts_sunday_september_27(self) -> None:
        days = month_grid(2026, 10)
        self.assertEqual(days[0], date(2026, 9, 27))
        self.assertEqual(days[0].weekday(), 6)
        self.assertEqual(days[4], date(2026, 10, 1))
        self.assertEqual(date(2026, 10, 1).weekday(), 3)
        self.assertEqual(days[-1], date(2026, 10, 31))
        self.assertEqual(days[-1].weekday(), 5)
        self.assertEqual(len(days) % 7, 0)
        self.assertNotIn(date(2026, 11, 1), days)

    def test_february_leap_year_includes_the_29th_and_2025_does_not(self) -> None:
        leap = month_grid(2024, 2)
        self.assertIn(date(2024, 2, 29), leap)
        self.assertEqual(leap[0].weekday(), 6)
        self.assertEqual(leap[-1].weekday(), 5)
        self.assertGreaterEqual(leap[-1], date(2024, 2, 29))
        plain = month_grid(2025, 2)
        self.assertFalse(any(day.month == 2 and day.day == 29 for day in plain))
        self.assertIn(date(2025, 2, 28), plain)
        self.assertEqual(plain[0].weekday(), 6)
        self.assertEqual(plain[-1].weekday(), 5)


class OverdueTests(unittest.TestCase):
    def test_date_only_deadline_stays_on_its_day_across_the_new_york_boundary(self) -> None:
        still_seventeenth = local_today("America/New_York", datetime(2026, 10, 18, 3, 30, tzinfo=timezone.utc))
        self.assertEqual(still_seventeenth, date(2026, 10, 17))
        self.assertFalse(
            is_task_overdue(date(2026, 10, 17), None, still_seventeenth, completed=False)
        )
        eighteenth = local_today("America/New_York", datetime(2026, 10, 18, 16, 0, tzinfo=timezone.utc))
        self.assertEqual(eighteenth, date(2026, 10, 18))
        self.assertTrue(is_task_overdue(date(2026, 10, 17), None, eighteenth, completed=False))
        self.assertFalse(is_task_overdue(date(2026, 10, 17), None, eighteenth, completed=True))

    def test_undated_and_review_tasks_are_not_placed_on_a_day(self) -> None:
        rows = [
            {"id": "dated", "status": "accepted", "title": "Register", "deadline": "2026-10-22", "deadline_text": "due", "completed": 0},
            {"id": "later", "status": "accepted", "title": "Someday", "deadline": None, "deadline_text": None, "completed": 0},
            {"id": "fuzzy", "status": "accepted", "title": "Ask later", "deadline": None, "deadline_text": "next Friday", "date_ambiguous": 1, "completed": 0},
            {"id": "flagged", "status": "accepted", "title": "Weekday only", "deadline": None, "deadline_text": None, "date_ambiguous": 1, "completed": 0},
            {"id": "suggested", "status": "suggested", "title": "Nope", "deadline": "2026-10-22", "completed": 0},
            {"id": "same-a", "status": "accepted", "title": "Alpha", "deadline": "2026-10-22", "due_time": "09:00", "completed": 0},
            {"id": "same-b", "status": "accepted", "title": "Beta", "deadline": "2026-10-22", "due_time": None, "completed": 0},
        ]
        split = split_task_calendar(rows, start=date(2026, 9, 27), end=date(2026, 10, 31), today=date(2026, 10, 18))
        self.assertEqual([row["id"] for row in split["tasks"]], ["same-a", "same-b", "dated"])
        self.assertEqual([row["id"] for row in split["undated"]], ["later"])
        self.assertEqual([row["id"] for row in split["needs_date_review"]], ["fuzzy", "flagged"])


class TaskCalendarApiTests(DataDirTest):
    def setUp(self) -> None:
        super().setUp()
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        super().tearDown()

    def _import_workshop(self) -> dict:
        item = ExtractedItem(
            title="Design workshop",
            summary="A Saturday workshop",
            category=Category.CAMPUS_EVENTS,
            supporting_text=OCR,
            event_date=date(2026, 10, 25),
            start_time="14:00",
            location="Studio 4",
            tasks=[
                ExtractedTask(
                    title="Register for workshop",
                    due_date=date(2026, 10, 22),
                    due_time="17:00",
                    supporting_text="Register by 2026-10-22",
                    deadline_text="Register by 2026-10-22",
                ),
                ExtractedTask(
                    title="Ask about materials",
                    due_date=None,
                    supporting_text="Ask about materials",
                    deadline_text="sometime next Friday",
                    date_ambiguous=True,
                ),
            ],
        )
        with (
            patch("app.main.ocr.extract_text", return_value=OCR),
            patch("app.main.extractor.extract_items", return_value=ExtractionOutcome(items=[item], dropped_ungrounded=0)),
        ):
            uploaded = self.client.post("/api/screenshots", files={"file": ("flyer.png", sample_png(), "image/png")})
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            imported = self.client.post(f"/api/screenshots/{uploaded.json()['screenshot']['id']}/interpret")
        self.assertEqual(imported.status_code, 200, imported.text)
        return imported.json()["screenshot"]

    def test_registration_deadline_is_not_the_event_date(self) -> None:
        shot = self._import_workshop()
        event = shot["items"][0]
        register = next(task for task in event["tasks"] if task["title"] == "Register for workshop")
        fuzzy = next(task for task in event["tasks"] if task["title"] == "Ask about materials")
        self.assertEqual(self.client.get("/api/task-calendar", params={"start": "2026-09-27", "end": "2026-10-31"}).json()["tasks"], [])

        accepted = self.client.patch(f"/api/tasks/{register['id']}", json={"status": "accepted"})
        again = self.client.post(
            f"/api/items/{event['id']}/tasks",
            json={"title": "Register for workshop", "supporting_text": "Register by 2026-10-22", "due_date": "2026-10-22"},
        )
        self.assertEqual(again.json()["id"], register["id"])
        self.client.patch(f"/api/tasks/{fuzzy['id']}", json={"status": "accepted"})
        undated = self.client.post(
            f"/api/items/{event['id']}/tasks",
            json={"title": "Buy a notebook", "supporting_text": "Buy a notebook"},
        )
        self.assertEqual(undated.status_code, 200, undated.text)
        extra = self.client.post(
            f"/api/items/{event['id']}/tasks",
            json={"title": "Email the host", "supporting_text": "Email the host", "due_date": "2026-10-22"},
        )

        with patch("app.main.local_today", return_value=date(2026, 10, 18)):
            body = self.client.get(
                "/api/task-calendar",
                params={"start": "2026-09-27", "end": "2026-10-31", "timezone": "America/New_York"},
            )
        self.assertEqual(body.status_code, 200, body.text)
        payload = body.json()
        dated = {row["title"]: row for row in payload["tasks"]}
        self.assertEqual(set(dated), {"Register for workshop", "Email the host"})
        self.assertEqual(dated["Register for workshop"]["deadline"], "2026-10-22")
        self.assertEqual(dated["Register for workshop"]["due_time"], "17:00")
        self.assertNotIn("Design workshop", dated)
        self.assertTrue(all(row["deadline"] != "2026-10-25" for row in payload["tasks"]))
        self.assertEqual([row["title"] for row in payload["undated"]], ["Buy a notebook"])
        self.assertEqual([row["title"] for row in payload["needs_date_review"]], ["Ask about materials"])
        self.assertEqual(payload["today"], "2026-10-18")
        self.assertFalse(dated["Register for workshop"]["overdue"])
        self.assertEqual(accepted.json()["id"], register["id"])

        events = self.client.get("/api/calendar", params={"start": "2026-09-27", "end": "2026-10-31"})
        self.assertEqual(events.json(), [])

    def test_edits_completion_and_a_new_connection_keep_the_same_task(self) -> None:
        shot = self._import_workshop()
        event = shot["items"][0]
        register = next(task for task in event["tasks"] if task["title"] == "Register for workshop")
        self.client.patch(f"/api/tasks/{register['id']}", json={"status": "accepted"})

        moved = self.client.patch(
            f"/api/tasks/{register['id']}",
            json={"due_date": "2026-10-17", "due_time": None},
        )
        self.assertEqual(moved.json()["deadline"], "2026-10-17")
        self.assertIsNone(moved.json()["due_time"])
        with patch("app.main.local_today", return_value=date(2026, 10, 17)):
            on_day = self.client.get("/api/task-calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
        row = on_day.json()["tasks"][0]
        self.assertEqual(row["deadline"], "2026-10-17")
        self.assertFalse(row["overdue"])
        self.assertEqual(on_day.json()["today"], "2026-10-17")

        with patch("app.main.local_today", return_value=date(2026, 10, 18)):
            late = self.client.get("/api/task-calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
        self.assertTrue(late.json()["tasks"][0]["overdue"])
        self.assertEqual(late.json()["tasks"][0]["deadline"], "2026-10-17")

        done = self.client.patch(f"/api/tasks/{register['id']}", json={"completed": True})
        self.assertTrue(done.json()["completed"])
        with patch("app.main.local_today", return_value=date(2026, 10, 18)):
            finished = self.client.get("/api/task-calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
        self.assertTrue(finished.json()["tasks"][0]["completed"])
        self.assertFalse(finished.json()["tasks"][0]["overdue"])

        reopened = self.client.patch(f"/api/tasks/{register['id']}", json={"completed": False})
        self.assertFalse(reopened.json()["completed"])
        with patch("app.main.local_today", return_value=date(2026, 10, 18)):
            back = self.client.get("/api/task-calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
        self.assertTrue(back.json()["tasks"][0]["overdue"])

        cleared = self.client.patch(f"/api/tasks/{register['id']}", json={"due_date": None})
        self.assertIsNone(cleared.json()["deadline"])
        with patch("app.main.local_today", return_value=date(2026, 10, 18)):
            later = self.client.get("/api/task-calendar", params={"start": "2026-10-01", "end": "2026-10-31"})
        self.assertEqual(later.json()["tasks"], [])
        self.assertEqual([row["title"] for row in later.json()["undated"]], ["Register for workshop"])
        self.assertEqual(later.json()["needs_date_review"], [])

        with TestClient(app) as reloaded:
            persisted = reloaded.get("/api/task-calendar", params={"start": "2026-09-01", "end": "2026-10-31"})
        self.assertEqual(persisted.status_code, 200, persisted.text)
        self.assertEqual([row["id"] for row in persisted.json()["undated"]], [register["id"]])
        self.assertEqual(persisted.json()["tasks"], [])

    def test_google_link_waits_for_an_end_and_does_not_save_the_suggestion(self) -> None:
        shot = self._import_workshop()
        event = shot["items"][0]
        blocked = self.client.get(f"/api/items/{event['id']}/google-calendar")
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.json()["error"], "needs_confirmation")
        self.assertNotIn("url", blocked.json())

        self.client.post(f"/api/items/{event['id']}/confirm")
        missing_end = self.client.get(f"/api/items/{event['id']}/google-calendar")
        self.assertEqual(missing_end.status_code, 400)
        self.assertEqual(missing_end.json()["error"], "needs_end_time")
        self.assertNotIn("url", missing_end.json())

        opened = self.client.get(f"/api/items/{event['id']}/google-calendar", params={"end_time": "15:00"})
        self.assertEqual(opened.status_code, 200, opened.text)
        params = query_params(opened.json()["url"])
        self.assertEqual(params["text"], "Design workshop")
        self.assertEqual(params["dates"], "20261025T140000/20261025T150000")
        self.assertEqual(params["location"], "Studio 4")
        self.assertEqual(params["ctz"], "America/New_York")
        self.assertIn("A Saturday workshop", params["details"])
        self.assertIn("Campus events", params["details"])
        url = opened.json()["url"]
        self.assertNotIn(OCR, url)
        self.assertNotIn(STORED_PATH, url)
        self.assertNotIn("flyer.png", url)
        self.assertNotIn("/image", url)
        stored = self.client.get(f"/api/items/{event['id']}").json()
        self.assertIsNone(stored["event"]["end_time"])

        renamed = self.client.patch(
            f"/api/items/{event['id']}",
            json={
                "title": "Café & Q&A #1 — 日本語",
                "location": "Room 5 & hall #2 — café",
                "end_date": "2026-10-26",
                "end_time": "16:00",
                "timezone": "America/Chicago",
            },
        )
        self.assertEqual(renamed.status_code, 200, renamed.text)
        linked = self.client.get(f"/api/items/{event['id']}/google-calendar")
        self.assertEqual(linked.status_code, 200, linked.text)
        params = query_params(linked.json()["url"])
        self.assertEqual(params["text"], "Café & Q&A #1 — 日本語")
        self.assertEqual(params["location"], "Room 5 & hall #2 — café")
        self.assertEqual(params["dates"], "20261025T140000/20261026T160000")
        self.assertEqual(params["ctz"], "America/Chicago")
        self.assertEqual(urlsplit(linked.json()["url"]).fragment, "")
        self.assertNotIn(OCR, linked.json()["url"])

        self.client.patch(f"/api/items/{event['id']}", json={"location": None, "meeting_url": None})
        no_place = self.client.get(f"/api/items/{event['id']}/google-calendar")
        self.assertEqual(no_place.json()["error"], "needs_location")

        self.client.patch(f"/api/items/{event['id']}", json={"event_date": None, "location": "Studio 4"})
        no_date = self.client.get(f"/api/items/{event['id']}/google-calendar")
        self.assertEqual(no_date.json()["error"], "needs_event_date")

    def test_an_extracurricular_event_uses_its_event_fields(self) -> None:
        shot = self._import_workshop()
        event = shot["items"][0]
        self.client.post(f"/api/items/{event['id']}/confirm")
        renamed = self.client.patch(
            f"/api/items/{event['id']}",
            json={
                "title": "Hack Like W@CC 2026",
                "category": "Extracurriculars",
                "end_date": "2026-10-18",
                "end_time": "15:00",
                "start_time": "11:00",
                "event_date": "2026-10-17",
                "location": "Klaus Atrium",
                "timezone": "America/New_York",
            },
        )
        self.assertEqual(renamed.status_code, 200, renamed.text)
        opened = self.client.get(f"/api/items/{event['id']}/google-calendar")
        self.assertEqual(opened.status_code, 200, opened.text)
        params = query_params(opened.json()["url"])
        self.assertEqual(params["text"], "Hack Like W@CC 2026")
        self.assertEqual(params["dates"], "20261017T110000/20261018T150000")
        self.assertEqual(params["location"], "Klaus Atrium")
        self.assertEqual(params["ctz"], "America/New_York")
        self.assertIn("Extracurriculars", params["details"])
        self.assertNotIn("Synced", opened.json()["url"])
