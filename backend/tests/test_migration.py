import os
import sqlite3
from pathlib import Path

from app import database
from tests.support import DataDirTest

OLD_SCHEMA = """
CREATE TABLE screenshots (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    ocr_text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    screenshot_id TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    category TEXT NOT NULL,
    deadline TEXT,
    supporting_text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (screenshot_id) REFERENCES screenshots(id)
);
"""


class MigrationTests(DataDirTest):
    def test_existing_tasks_and_completion_survive_migration(self) -> None:
        path = Path(os.environ["PIXIE_DATA_DIR"]) / "pixie.db"
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path)
        conn.executescript(OLD_SCHEMA)
        conn.execute(
            """
            INSERT INTO screenshots (
                id, original_filename, stored_name, media_type, ocr_text, created_at
            ) VALUES ('shot-1', 'fair.png', 'shot-1.png', 'image/png', 'Apply by 2026-10-10', '2026-10-01T12:00:00+00:00')
            """
        )
        conn.execute(
            """
            INSERT INTO tasks (
                id, screenshot_id, title, details, category, deadline, supporting_text,
                completed, created_at, completed_at
            ) VALUES (
                'task-1', 'shot-1', 'Reserve a resume review', 'Edited detail',
                'Career Opportunities', '2026-10-10', 'Apply by 2026-10-10',
                1, '2026-10-01T12:05:00+00:00', '2026-10-02T12:00:00+00:00'
            )
            """
        )
        conn.commit()
        conn.close()

        database.init_db()
        database.init_db()
        tasks = database.list_tasks()
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["id"], "task-1")
        self.assertEqual(tasks[0]["completed"], 1)
        self.assertEqual(tasks[0]["completed_at"], "2026-10-02T12:00:00+00:00")
        self.assertEqual(tasks[0]["deadline"], "2026-10-10")
        self.assertEqual(tasks[0]["status"], "accepted")
        item = database.get_item(tasks[0]["item_id"])
        assert item is not None
        self.assertEqual(item["title"], "Reserve a resume review")
        self.assertEqual(item["review_status"], "confirmed")
        self.assertEqual(item["screenshot_id"], "shot-1")
        self.assertIsNone(item["event"])
        self.assertEqual(len(database.items_for_screenshot("shot-1")), 1)
        screenshot = database.get_screenshot("shot-1")
        assert screenshot is not None
        self.assertEqual(screenshot["ocr_text"], "Apply by 2026-10-10")
        self.assertEqual(screenshot["processing_status"], "ready")
        self.assertIsNone(screenshot["display_title"])
        self.assertIsNone(screenshot["category"])
        self.assertIsNone(screenshot["approved_at"])
        self.assertIsNone(screenshot["image_hash"])
        self.assertEqual(tasks[0]["date_ambiguous"], 0)
