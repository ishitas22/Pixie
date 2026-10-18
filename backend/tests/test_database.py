from datetime import date

from app import database
from tests.support import DataDirTest, sample_png


class DatabaseTests(DataDirTest):
    def setUp(self) -> None:
        super().setUp()
        database.init_db()

    def test_accepted_tasks_survive_a_new_connection(self) -> None:
        shot = database.insert_screenshot(
            original_filename="fair.png",
            extension=".png",
            media_type="image/png",
            ocr_text="Apply by 2026-10-10",
            data=sample_png("Apply by 2026-10-10"),
        )
        created = database.insert_tasks(
            shot["id"],
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
        self.assertEqual(len(created), 1)
        reloaded = database.list_tasks()
        self.assertEqual(reloaded[0]["title"], "Reserve a resume review")
        self.assertEqual(reloaded[0]["screenshot_id"], shot["id"])
        self.assertTrue(reloaded[0]["item_id"])
        self.assertEqual(reloaded[0]["status"], "accepted")
        updated = database.set_completed(created[0]["id"], True)
        assert updated is not None
        self.assertEqual(updated["completed"], 1)
        again = database.list_tasks()
        self.assertEqual(again[0]["completed"], 1)
        cleared = database.set_completed(created[0]["id"], False)
        assert cleared is not None
        self.assertEqual(cleared["completed"], 0)
        self.assertIsNone(cleared["completed_at"])

    def test_missing_screenshot_cannot_own_a_task(self) -> None:
        with self.assertRaises(KeyError):
            database.insert_tasks(
                "missing",
                [
                    {
                        "title": "Orphan",
                        "details": None,
                        "category": "Other",
                        "deadline": None,
                        "supporting_text": "nowhere",
                    }
                ],
            )
