import unittest
from datetime import date, datetime, timezone

from app.dates import local_today
from app.schedule import build_dashboard, missing_information


class ScheduleTests(unittest.TestCase):
    def test_new_york_date_boundary_does_not_shift_date_only_values(self) -> None:
        now = datetime(2026, 10, 18, 3, 30, tzinfo=timezone.utc)
        today = local_today("America/New_York", now)
        self.assertEqual(today, date(2026, 10, 17))
        self.assertEqual(local_today("UTC", now), date(2026, 10, 18))
        tasks = [
            {"id": "today", "status": "accepted", "completed": 0, "deadline": "2026-10-17", "title": "Today", "due_time": None},
            {"id": "overdue", "status": "accepted", "completed": 0, "deadline": "2026-10-16", "title": "Late", "due_time": None},
            {"id": "upcoming", "status": "accepted", "completed": 0, "deadline": "2026-10-18", "title": "Later", "due_time": "09:00"},
            {"id": "done", "status": "accepted", "completed": 1, "deadline": "2026-10-16", "title": "Done", "due_time": None},
            {"id": "discarded", "status": "discarded", "completed": 0, "deadline": "2026-10-16", "title": "No", "due_time": None},
            {"id": "undated", "status": "accepted", "completed": 0, "deadline": None, "title": "Someday", "due_time": None},
        ]
        events = [
            {"title": "Tonight", "event_date": "2026-10-17", "on_calendar": 1, "review_status": "confirmed", "start_time": "19:00"},
            {"title": "Tomorrow", "event_date": "2026-10-18", "on_calendar": 1, "review_status": "confirmed", "start_time": None},
            {"title": "Saved only", "event_date": "2026-10-17", "on_calendar": 0, "review_status": "confirmed", "start_time": None},
        ]
        built = build_dashboard(today=today, tasks=tasks, events=events, review_items=[{"id": "review"}])
        self.assertEqual([row["title"] for row in built["today_events"]], ["Tonight"])
        self.assertEqual([row["title"] for row in built["upcoming_events"]], ["Tomorrow"])
        self.assertEqual([row["id"] for row in built["today_tasks"]], ["today"])
        self.assertEqual([row["id"] for row in built["overdue_tasks"]], ["overdue"])
        self.assertEqual([row["id"] for row in built["upcoming_tasks"]], ["upcoming"])
        self.assertEqual([row["id"] for row in built["undated_tasks"]], ["undated"])
        self.assertEqual(built["needs_review"], [{"id": "review"}])

    def test_missing_information_calls_out_an_ambiguous_date_and_location(self) -> None:
        notes = missing_information(
            {"ambiguities": "Room number was cut off.", "registration_required": 1, "registration_deadline": None},
            {"date_text": "Meet next Friday.", "event_date": None, "location": None, "meeting_url": None, "start_time": None},
        )
        self.assertIn("Room number was cut off.", notes)
        self.assertIn("Date needs review: Meet next Friday.", notes)
        self.assertIn("Registration deadline", notes)
