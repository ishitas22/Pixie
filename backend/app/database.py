"""SQLite storage for screenshots, saved items, events, and tasks."""

import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from app.config import data_dir, database_path, image_dir
from app.schemas import CATEGORIES, ExtractedItem

_FILE_EXT = re.compile(r"(?i)\.(?:png|jpe?g|gif|webp|heic)$")

_CATEGORY_SQL = ", ".join(f"'{category}'" for category in CATEGORIES)
SCHEMA = f"""
CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    ocr_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'ready',
    extraction_error TEXT,
    display_title TEXT,
    draft_title TEXT,
    category TEXT,
    draft_category TEXT,
    summary TEXT,
    ambiguities TEXT,
    approved_at TEXT,
    image_hash TEXT
);

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    screenshot_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    category TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'needs_review',
    supporting_text TEXT NOT NULL,
    ambiguities TEXT,
    registration_required INTEGER,
    registration_url TEXT,
    registration_deadline TEXT,
    registration_status TEXT NOT NULL DEFAULT 'unknown',
    registration_evidence TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confirmed_at TEXT,
    FOREIGN KEY (screenshot_id) REFERENCES screenshots(id),
    CHECK (category IN ({_CATEGORY_SQL})),
    CHECK (review_status IN ('needs_review', 'confirmed')),
    CHECK (registration_status IN ('unknown', 'registered', 'not_registered')),
    CHECK (registration_required IS NULL OR registration_required IN (0, 1))
);

CREATE TABLE IF NOT EXISTS events (
    item_id TEXT PRIMARY KEY,
    event_date TEXT,
    end_date TEXT,
    start_time TEXT,
    end_time TEXT,
    timezone TEXT,
    location TEXT,
    meeting_url TEXT,
    on_calendar INTEGER NOT NULL DEFAULT 0,
    date_text TEXT,
    time_text TEXT,
    location_text TEXT,
    FOREIGN KEY (item_id) REFERENCES items(id),
    CHECK (on_calendar IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    screenshot_id TEXT NOT NULL,
    item_id TEXT,
    title TEXT NOT NULL,
    details TEXT,
    category TEXT NOT NULL,
    deadline TEXT,
    due_time TEXT,
    supporting_text TEXT NOT NULL,
    deadline_text TEXT,
    kind TEXT NOT NULL DEFAULT 'explicit',
    date_ambiguous INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'accepted',
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (screenshot_id) REFERENCES screenshots(id),
    FOREIGN KEY (item_id) REFERENCES items(id),
    CHECK (category IN ({_CATEGORY_SQL})),
    CHECK (completed IN (0, 1)),
    CHECK (status IN ('suggested', 'accepted', 'discarded'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_screenshot ON tasks(screenshot_id);
CREATE INDEX IF NOT EXISTS idx_items_screenshot ON items(screenshot_id);
"""

TASK_SELECT = """
SELECT
    t.id,
    t.screenshot_id,
    t.item_id,
    t.title,
    t.details,
    COALESCE(i.category, t.category) AS category,
    t.deadline,
    t.due_time,
    t.supporting_text,
    t.deadline_text,
    t.kind,
    t.date_ambiguous,
    t.status,
    t.completed,
    t.created_at,
    t.completed_at,
    s.original_filename AS filename,
    s.stored_name,
    s.display_title,
    s.draft_title,
    s.approved_at,
    i.title AS item_title,
    e.event_date AS event_date
FROM tasks t
JOIN screenshots s ON s.id = t.screenshot_id
LEFT JOIN items i ON i.id = t.item_id
LEFT JOIN events e ON e.item_id = t.item_id
"""

ITEM_COLUMNS = {
    "title",
    "summary",
    "category",
    "supporting_text",
    "ambiguities",
    "registration_required",
    "registration_url",
    "registration_deadline",
    "registration_status",
    "registration_evidence",
}
EVENT_COLUMNS = {
    "event_date",
    "end_date",
    "start_time",
    "end_time",
    "timezone",
    "location",
    "meeting_url",
    "date_text",
    "time_text",
    "location_text",
}


class CalendarRejected(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return str(uuid.uuid4())


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    data_dir().mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(database_path())
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _add_column(conn: sqlite3.Connection, table: str, column: str, declaration: str) -> None:
    if column not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


def presentation_title(
    *,
    display_title: object,
    draft_title: object,
    item_title: object,
    locked: bool,
) -> str:
    """User-facing screenshot name. Original filenames are not titles."""

    def clean(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        text = " ".join(value.split())
        if not text or _FILE_EXT.search(text):
            return None
        return text

    if locked:
        return clean(display_title) or clean(item_title) or clean(draft_title) or "Untitled screenshot"
    return clean(draft_title) or clean(display_title) or clean(item_title) or "Untitled screenshot"


def _migrate(conn: sqlite3.Connection) -> None:
    _add_column(conn, "screenshots", "processing_status", "TEXT NOT NULL DEFAULT 'ready'")
    _add_column(conn, "screenshots", "extraction_error", "TEXT")
    _add_column(conn, "screenshots", "display_title", "TEXT")
    _add_column(conn, "screenshots", "draft_title", "TEXT")
    _add_column(conn, "screenshots", "category", "TEXT")
    _add_column(conn, "screenshots", "draft_category", "TEXT")
    _add_column(conn, "screenshots", "summary", "TEXT")
    _add_column(conn, "screenshots", "ambiguities", "TEXT")
    _add_column(conn, "screenshots", "approved_at", "TEXT")
    _add_column(conn, "screenshots", "image_hash", "TEXT")
    _add_column(conn, "tasks", "item_id", "TEXT")
    _add_column(conn, "tasks", "due_time", "TEXT")
    _add_column(conn, "tasks", "deadline_text", "TEXT")
    _add_column(conn, "tasks", "status", "TEXT NOT NULL DEFAULT 'accepted'")
    _add_column(conn, "tasks", "kind", "TEXT NOT NULL DEFAULT 'explicit'")
    _add_column(conn, "tasks", "date_ambiguous", "INTEGER NOT NULL DEFAULT 0")
    _add_column(conn, "events", "end_date", "TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_item ON tasks(item_id)")
    conn.execute(
        """
        UPDATE screenshots
        SET processing_status = 'no_text'
        WHERE processing_status = 'ready' AND trim(ocr_text) = ''
        """
    )
    orphans = conn.execute("SELECT * FROM tasks WHERE item_id IS NULL").fetchall()
    for task in orphans:
        item_id = new_id()
        created_at = task["created_at"]
        conn.execute(
            """
            INSERT INTO items (
                id, screenshot_id, title, summary, category, review_status,
                supporting_text, ambiguities, registration_required, registration_url,
                registration_deadline, registration_status, registration_evidence,
                created_at, updated_at, confirmed_at
            ) VALUES (?, ?, ?, ?, ?, 'confirmed', ?, NULL, NULL, NULL, NULL, 'unknown', NULL, ?, ?, ?)
            """,
            (
                item_id,
                task["screenshot_id"],
                task["title"],
                task["details"],
                task["category"],
                task["supporting_text"],
                created_at,
                created_at,
                created_at,
            ),
        )
        conn.execute(
            "UPDATE tasks SET item_id = ?, status = 'accepted' WHERE id = ?",
            (item_id, task["id"]),
        )


def init_db() -> None:
    image_dir().mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)


def insert_screenshot(
    *,
    original_filename: str,
    extension: str,
    media_type: str,
    ocr_text: str,
    data: bytes,
    image_hash: str | None = None,
) -> dict:
    screenshot_id = new_id()
    stored_name = f"{screenshot_id}{extension}"
    created_at = utc_now()
    image_dir().mkdir(parents=True, exist_ok=True)
    destination = image_dir() / stored_name
    destination.write_bytes(data)
    try:
        with get_conn() as conn:
            conn.execute(
                """
                INSERT INTO screenshots (
                    id, original_filename, stored_name, media_type, ocr_text,
                    created_at, processing_status, extraction_error, image_hash
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
                """,
                (screenshot_id, original_filename, stored_name, media_type, ocr_text, created_at, image_hash),
            )
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    stored = get_screenshot(screenshot_id)
    if stored is None:
        raise RuntimeError("Screenshot was not saved.")
    return stored


def update_ocr(screenshot_id: str, ocr_text: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE screenshots SET ocr_text = ? WHERE id = ?",
            (ocr_text, screenshot_id),
        )


def set_image_hash(screenshot_id: str, image_hash: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE screenshots SET image_hash = ? WHERE id = ?",
            (image_hash, screenshot_id),
        )


def screenshots_missing_hash() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, stored_name, image_hash
            FROM screenshots
            WHERE image_hash IS NULL OR trim(image_hash) = ''
            """
        ).fetchall()
    return [dict(row) for row in rows]


def list_similarity_candidates() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, original_filename, stored_name, image_hash,
                   display_title, draft_title, approved_at
            FROM screenshots
            """
        ).fetchall()
    return [dict(row) for row in rows]


def delete_screenshot(screenshot_id: str) -> dict | None:
    """Remove one screenshot and the items, events, and tasks that belong to it."""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM screenshots WHERE id = ?", (screenshot_id,)).fetchone()
        if row is None:
            return None
        item_ids = [
            item["id"]
            for item in conn.execute("SELECT id FROM items WHERE screenshot_id = ?", (screenshot_id,))
        ]
        conn.execute("DELETE FROM tasks WHERE screenshot_id = ?", (screenshot_id,))
        if item_ids:
            marks = ", ".join("?" for _ in item_ids)
            conn.execute(f"DELETE FROM tasks WHERE item_id IN ({marks})", item_ids)
            conn.execute(f"DELETE FROM events WHERE item_id IN ({marks})", item_ids)
        conn.execute("DELETE FROM items WHERE screenshot_id = ?", (screenshot_id,))
        conn.execute("DELETE FROM screenshots WHERE id = ?", (screenshot_id,))
    return dict(row)


def set_processing(screenshot_id: str, status: str, error: str | None) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE screenshots SET processing_status = ?, extraction_error = ? WHERE id = ?",
            (status, error, screenshot_id),
        )


def get_screenshot(screenshot_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM screenshots WHERE id = ?", (screenshot_id,)).fetchone()
    return dict(row) if row else None


def _required_int(value: bool | None) -> int | None:
    if value is None:
        return None
    return 1 if value else 0


def _iso(value: object) -> str | None:
    if value is None or value == "":
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _has_event(item: ExtractedItem) -> bool:
    return any(
        (
            item.event_date,
            item.end_date,
            item.event_date_text,
            item.start_time,
            item.end_time,
            item.timezone,
            item.location,
            item.meeting_url,
        )
    )


def _insert_extracted(conn: sqlite3.Connection, screenshot_id: str, item: ExtractedItem, review_status: str) -> str:
    item_id = new_id()
    now = utc_now()
    confirmed_at = now if review_status == "confirmed" else None
    conn.execute(
        """
        INSERT INTO items (
            id, screenshot_id, title, summary, category, review_status, supporting_text,
            ambiguities, registration_required, registration_url, registration_deadline,
            registration_status, registration_evidence, created_at, updated_at, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?, ?, ?)
        """,
        (
            item_id,
            screenshot_id,
            item.title,
            item.summary,
            item.category.value,
            review_status,
            item.supporting_text,
            item.ambiguities,
            _required_int(item.registration_required),
            item.registration_url,
            _iso(item.registration_deadline),
            item.registration_text,
            now,
            now,
            confirmed_at,
        ),
    )
    if _has_event(item):
        conn.execute(
            """
            INSERT INTO events (
                item_id, event_date, end_date, start_time, end_time, timezone, location, meeting_url,
                on_calendar, date_text, time_text, location_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            """,
            (
                item_id,
                _iso(item.event_date),
                _iso(item.end_date),
                item.start_time,
                item.end_time,
                item.timezone,
                item.location,
                item.meeting_url,
                item.event_date_text,
                item.event_date_text if item.start_time else None,
                item.location,
            ),
        )
    for task in item.tasks:
        conn.execute(
            """
            INSERT INTO tasks (
                id, screenshot_id, item_id, title, details, category, deadline, due_time,
                supporting_text, deadline_text, kind, date_ambiguous, status, completed, created_at, completed_at
            ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'suggested', 0, ?, NULL)
            """,
            (
                new_id(),
                screenshot_id,
                item_id,
                task.title,
                item.category.value,
                _iso(task.due_date),
                task.due_time,
                task.supporting_text,
                task.deadline_text,
                task.kind.value,
                1 if task.date_ambiguous else 0,
                now,
            ),
        )
    return item_id


def _analysis_locked(conn: sqlite3.Connection, row: sqlite3.Row) -> bool:
    if row["approved_at"]:
        return True
    found = conn.execute(
        "SELECT 1 FROM items WHERE screenshot_id = ? AND review_status = 'confirmed' LIMIT 1",
        (row["id"],),
    ).fetchone()
    return found is not None


def _fallback_title(items: list[ExtractedItem]) -> str | None:
    names = [item.title.strip() for item in items if item.title.strip()]
    if not names:
        return None
    if len(names) == 1:
        return names[0][:200]
    return f"{names[0]} and {names[1]}"[:200]


def _clean_category_value(category: str | None, items: list[ExtractedItem]) -> str | None:
    if category in CATEGORIES:
        return category
    if items:
        return items[0].category.value
    return None


def store_interpretation(
    screenshot_id: str,
    items: list[ExtractedItem],
    *,
    title: str | None,
    category: str | None,
    summary: str | None,
    ambiguities: str | None,
    replace: bool,
) -> None:
    """Save the latest reading. A locked title stays until the user approves a new one."""
    chosen_title = (title or "").strip() or _fallback_title(items)
    chosen_category = _clean_category_value(category, items)
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM screenshots WHERE id = ?", (screenshot_id,)).fetchone()
        if row is None:
            raise KeyError(screenshot_id)
        locked = _analysis_locked(conn, row)
        if chosen_title or chosen_category or summary or ambiguities:
            if locked:
                conn.execute(
                    """
                    UPDATE screenshots
                    SET draft_title = COALESCE(?, draft_title),
                        draft_category = COALESCE(?, draft_category)
                    WHERE id = ?
                    """,
                    (chosen_title, chosen_category, screenshot_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE screenshots
                    SET display_title = COALESCE(?, display_title),
                        draft_title = COALESCE(?, draft_title),
                        category = COALESCE(?, category),
                        draft_category = COALESCE(?, draft_category),
                        summary = ?,
                        ambiguities = ?
                    WHERE id = ?
                    """,
                    (
                        chosen_title,
                        chosen_title,
                        chosen_category,
                        chosen_category,
                        summary,
                        ambiguities,
                        screenshot_id,
                    ),
                )
        if replace:
            _delete_unconfirmed(conn, screenshot_id)
            existing = {
                existing_row["title"].casefold()
                for existing_row in conn.execute(
                    "SELECT title FROM items WHERE screenshot_id = ?",
                    (screenshot_id,),
                )
            }
            for item in items:
                if item.title.casefold() in existing:
                    continue
                _insert_extracted(conn, screenshot_id, item, "needs_review")
                existing.add(item.title.casefold())
        else:
            for item in items:
                _insert_extracted(conn, screenshot_id, item, "needs_review")


def _delete_unconfirmed(conn: sqlite3.Connection, screenshot_id: str) -> None:
    conn.execute(
        """
        DELETE FROM tasks
        WHERE status = 'suggested' AND item_id IN (
            SELECT id FROM items WHERE screenshot_id = ? AND review_status = 'needs_review'
        )
        """,
        (screenshot_id,),
    )
    conn.execute(
        """
        DELETE FROM events WHERE item_id IN (
            SELECT i.id FROM items i
            WHERE i.screenshot_id = ? AND i.review_status = 'needs_review'
            AND NOT EXISTS (
                SELECT 1 FROM tasks t WHERE t.item_id = i.id AND t.status != 'suggested'
            )
        )
        """,
        (screenshot_id,),
    )
    conn.execute(
        """
        DELETE FROM items
        WHERE screenshot_id = ? AND review_status = 'needs_review'
        AND NOT EXISTS (
            SELECT 1 FROM tasks t WHERE t.item_id = items.id AND t.status != 'suggested'
        )
        """,
        (screenshot_id,),
    )


def save_extracted_items(screenshot_id: str, items: list[ExtractedItem]) -> None:
    store_interpretation(
        screenshot_id,
        items,
        title=None,
        category=None,
        summary=None,
        ambiguities=None,
        replace=False,
    )


def replace_unconfirmed_items(screenshot_id: str, items: list[ExtractedItem]) -> None:
    store_interpretation(
        screenshot_id,
        items,
        title=None,
        category=None,
        summary=None,
        ambiguities=None,
        replace=True,
    )


def approve_screenshot(
    screenshot_id: str,
    *,
    title: str,
    category: str,
    summary: str | None,
    ambiguities: str | None,
    task_ids: list[str],
    task_titles: dict[str, str],
) -> None:
    """Save the screenshot title and category, then accept only the selected tasks."""
    if category not in CATEGORIES:
        raise ValueError(category)
    now = utc_now()
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM screenshots WHERE id = ?", (screenshot_id,)).fetchone()
        if row is None:
            raise KeyError(screenshot_id)
        conn.execute(
            """
            UPDATE screenshots
            SET display_title = ?,
                draft_title = ?,
                category = ?,
                draft_category = ?,
                summary = ?,
                ambiguities = ?,
                approved_at = COALESCE(approved_at, ?),
                processing_status = 'ready',
                extraction_error = NULL
            WHERE id = ?
            """,
            (title, title, category, category, summary, ambiguities, now, screenshot_id),
        )
        item_rows = conn.execute(
            "SELECT id FROM items WHERE screenshot_id = ? ORDER BY created_at, rowid",
            (screenshot_id,),
        ).fetchall()
        if len(item_rows) == 1:
            conn.execute(
                """
                UPDATE items
                SET title = ?, category = ?, summary = COALESCE(?, summary), updated_at = ?
                WHERE id = ?
                """,
                (title, category, summary, now, item_rows[0]["id"]),
            )
        for task_id in task_ids:
            task = conn.execute(
                "SELECT * FROM tasks WHERE id = ? AND screenshot_id = ?",
                (task_id, screenshot_id),
            ).fetchone()
            if task is None or task["status"] == "discarded":
                continue
            renamed = (task_titles.get(task_id) or task["title"] or "").strip() or task["title"]
            duplicate = conn.execute(
                """
                SELECT id FROM tasks
                WHERE screenshot_id = ? AND lower(title) = lower(?) AND status = 'accepted' AND id != ?
                """,
                (screenshot_id, renamed, task["id"]),
            ).fetchone()
            if duplicate is not None:
                continue
            conn.execute(
                "UPDATE tasks SET status = 'accepted', title = ? WHERE id = ?",
                (renamed[:200], task["id"]),
            )
        conn.execute(
            """
            UPDATE items
            SET review_status = 'confirmed',
                confirmed_at = COALESCE(confirmed_at, ?),
                updated_at = ?
            WHERE screenshot_id = ? AND review_status = 'needs_review'
            """,
            (now, now, screenshot_id),
        )


def _task_by_id(conn: sqlite3.Connection, task_id: str) -> dict | None:
    row = conn.execute(TASK_SELECT + " WHERE t.id = ?", (task_id,)).fetchone()
    return dict(row) if row else None


def _item_bundle(conn: sqlite3.Connection, item_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return None
    item = dict(row)
    event = conn.execute("SELECT * FROM events WHERE item_id = ?", (item_id,)).fetchone()
    item["event"] = dict(event) if event else None
    item["tasks"] = [
        dict(task)
        for task in conn.execute(
            TASK_SELECT + " WHERE t.item_id = ? ORDER BY t.created_at, t.id",
            (item_id,),
        )
    ]
    return item


def get_item(item_id: str) -> dict | None:
    with get_conn() as conn:
        return _item_bundle(conn, item_id)


def items_for_screenshot(screenshot_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id FROM items WHERE screenshot_id = ? ORDER BY created_at, rowid",
            (screenshot_id,),
        ).fetchall()
        return [bundle for row in rows if (bundle := _item_bundle(conn, row["id"])) is not None]


def get_bundle(screenshot_id: str) -> dict | None:
    screenshot = get_screenshot(screenshot_id)
    if screenshot is None:
        return None
    screenshot["items"] = items_for_screenshot(screenshot_id)
    return screenshot


def list_gallery() -> list[dict]:
    with get_conn() as conn:
        shots = [dict(row) for row in conn.execute("SELECT * FROM screenshots ORDER BY created_at DESC, id")]
        grouped: dict[str, list[sqlite3.Row]] = {}
        first_title: dict[str, str] = {}
        for row in conn.execute(
            "SELECT screenshot_id, title, category, review_status FROM items ORDER BY created_at, rowid"
        ):
            grouped.setdefault(row["screenshot_id"], []).append(row)
            first_title.setdefault(row["screenshot_id"], row["title"])
    images = []
    for shot in shots:
        linked = grouped.get(shot["id"], [])
        item_categories: list[str] = []
        for row in linked:
            if row["category"] not in item_categories:
                item_categories.append(row["category"])
        confirmed = any(row["review_status"] == "confirmed" for row in linked)
        locked = bool(shot.get("approved_at")) or confirmed
        primary = shot.get("category") if locked else (shot.get("draft_category") or shot.get("category"))
        if primary in CATEGORIES:
            categories = [primary]
        else:
            categories = item_categories
        shot["categories"] = categories
        shot["item_count"] = len(linked)
        shot["needs_review"] = any(row["review_status"] == "needs_review" for row in linked)
        shot["title_locked"] = locked
        shot["display_name"] = presentation_title(
            display_title=shot.get("display_title"),
            draft_title=shot.get("draft_title"),
            item_title=first_title.get(shot["id"]),
            locked=locked,
        )
        images.append(shot)
    return images


def list_tasks() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            TASK_SELECT + " WHERE t.status = 'accepted' ORDER BY t.completed ASC, t.created_at DESC, t.id ASC"
        ).fetchall()
    return [dict(row) for row in rows]


def _find_task(conn: sqlite3.Connection, screenshot_id: str, title: str, item_id: str | None = None) -> sqlite3.Row | None:
    if item_id:
        return conn.execute(
            """
            SELECT * FROM tasks
            WHERE item_id = ? AND lower(title) = lower(?) AND status != 'discarded'
            ORDER BY created_at LIMIT 1
            """,
            (item_id, title),
        ).fetchone()
    return conn.execute(
        """
        SELECT * FROM tasks
        WHERE screenshot_id = ? AND lower(title) = lower(?) AND status != 'discarded'
        ORDER BY created_at LIMIT 1
        """,
        (screenshot_id, title),
    ).fetchone()


def _confirm_row(conn: sqlite3.Connection, item_id: str, now: str) -> None:
    conn.execute(
        """
        UPDATE items
        SET review_status = 'confirmed',
            confirmed_at = COALESCE(confirmed_at, ?),
            updated_at = ?
        WHERE id = ?
        """,
        (now, now, item_id),
    )


def insert_tasks(screenshot_id: str, tasks: list[dict]) -> list[dict]:
    now = utc_now()
    created: list[dict] = []
    with get_conn() as conn:
        screenshot = conn.execute("SELECT id FROM screenshots WHERE id = ?", (screenshot_id,)).fetchone()
        if screenshot is None:
            raise KeyError(screenshot_id)
        for task in tasks:
            existing = _find_task(conn, screenshot_id, task["title"])
            if existing is not None:
                conn.execute(
                    """
                    UPDATE tasks
                    SET title = ?, details = ?, category = ?, deadline = ?, supporting_text = ?,
                        status = 'accepted'
                    WHERE id = ?
                    """,
                    (
                        task["title"],
                        task["details"],
                        task["category"],
                        task["deadline"],
                        task["supporting_text"],
                        existing["id"],
                    ),
                )
                if existing["item_id"]:
                    conn.execute(
                        """
                        UPDATE items
                        SET category = ?, summary = ?, updated_at = ?
                        WHERE id = ? AND review_status = 'needs_review'
                        """,
                        (task["category"], task["details"], now, existing["item_id"]),
                    )
                    _confirm_row(conn, existing["item_id"], now)
                stored = _task_by_id(conn, existing["id"])
            else:
                item_id = new_id()
                conn.execute(
                    """
                    INSERT INTO items (
                        id, screenshot_id, title, summary, category, review_status, supporting_text,
                        ambiguities, registration_required, registration_url, registration_deadline,
                        registration_status, registration_evidence, created_at, updated_at, confirmed_at
                    ) VALUES (?, ?, ?, ?, ?, 'confirmed', ?, NULL, NULL, NULL, NULL, 'unknown', NULL, ?, ?, ?)
                    """,
                    (
                        item_id,
                        screenshot_id,
                        task["title"],
                        task["details"],
                        task["category"],
                        task["supporting_text"],
                        now,
                        now,
                        now,
                    ),
                )
                task_id = new_id()
                conn.execute(
                    """
                    INSERT INTO tasks (
                        id, screenshot_id, item_id, title, details, category, deadline, due_time,
                        supporting_text, deadline_text, status, completed, created_at, completed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'accepted', 0, ?, NULL)
                    """,
                    (
                        task_id,
                        screenshot_id,
                        item_id,
                        task["title"],
                        task["details"],
                        task["category"],
                        task["deadline"],
                        task["supporting_text"],
                        now,
                    ),
                )
                stored = _task_by_id(conn, task_id)
            if stored is not None:
                created.append(stored)
    return created


def add_item_task(item_id: str, task: dict) -> dict | None:
    now = utc_now()
    with get_conn() as conn:
        item = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if item is None:
            return None
        existing = _find_task(conn, item["screenshot_id"], task["title"], item_id)
        if existing is not None:
            conn.execute(
                """
                UPDATE tasks
                SET status = 'accepted', details = ?, deadline = ?, due_time = ?, supporting_text = ?
                WHERE id = ?
                """,
                (
                    task.get("details") if task.get("details") else existing["details"],
                    task.get("deadline") or existing["deadline"],
                    task.get("due_time") or existing["due_time"],
                    task.get("supporting_text") or existing["supporting_text"],
                    existing["id"],
                ),
            )
            stored = _task_by_id(conn, existing["id"])
            return stored
        task_id = new_id()
        conn.execute(
            """
            INSERT INTO tasks (
                id, screenshot_id, item_id, title, details, category, deadline, due_time,
                supporting_text, deadline_text, status, completed, created_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'accepted', 0, ?, NULL)
            """,
            (
                task_id,
                item["screenshot_id"],
                item_id,
                task["title"],
                task.get("details"),
                item["category"],
                task.get("deadline"),
                task.get("due_time"),
                task.get("supporting_text") or item["supporting_text"],
                now,
            ),
        )
        return _task_by_id(conn, task_id)


def update_task(task_id: str, changes: dict) -> dict | None:
    allowed = {
        "title",
        "details",
        "deadline",
        "due_time",
        "supporting_text",
        "deadline_text",
        "date_ambiguous",
        "status",
        "completed",
        "completed_at",
    }
    with get_conn() as conn:
        current = _task_by_id(conn, task_id)
        if current is None:
            return None
        payload = {key: value for key, value in changes.items() if key in allowed}
        if not payload:
            return current
        sets = ", ".join(f"{key} = ?" for key in payload)
        conn.execute(f"UPDATE tasks SET {sets} WHERE id = ?", (*payload.values(), task_id))
        return _task_by_id(conn, task_id)


def set_completed(task_id: str, completed: bool) -> dict | None:
    with get_conn() as conn:
        current = _task_by_id(conn, task_id)
        if current is None:
            return None
        if completed and current["completed"]:
            return current
        completed_at = utc_now() if completed else None
        conn.execute(
            "UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?",
            (1 if completed else 0, completed_at, task_id),
        )
        return _task_by_id(conn, task_id)


def update_item(item_id: str, changes: dict) -> dict | None:
    with get_conn() as conn:
        current = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if current is None:
            return None
        item_changes = {key: value for key, value in changes.items() if key in ITEM_COLUMNS}
        if item_changes:
            item_changes["updated_at"] = utc_now()
            sets = ", ".join(f"{key} = ?" for key in item_changes)
            conn.execute(f"UPDATE items SET {sets} WHERE id = ?", (*item_changes.values(), item_id))
        event_changes = {key: value for key, value in changes.items() if key in EVENT_COLUMNS}
        if event_changes:
            existing = conn.execute("SELECT item_id FROM events WHERE item_id = ?", (item_id,)).fetchone()
            if existing:
                sets = ", ".join(f"{key} = ?" for key in event_changes)
                conn.execute(f"UPDATE events SET {sets} WHERE item_id = ?", (*event_changes.values(), item_id))
            else:
                payload = {key: None for key in EVENT_COLUMNS}
                payload.update(event_changes)
                payload["on_calendar"] = 0
                columns = ["item_id", *payload.keys()]
                conn.execute(
                    f"INSERT INTO events ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})",
                    (item_id, *payload.values()),
                )
        return _item_bundle(conn, item_id)


def confirm_item(item_id: str) -> dict | None:
    with get_conn() as conn:
        current = conn.execute("SELECT id FROM items WHERE id = ?", (item_id,)).fetchone()
        if current is None:
            return None
        _confirm_row(conn, item_id, utc_now())
        return _item_bundle(conn, item_id)


def set_on_calendar(item_id: str, on_calendar: bool) -> dict:
    with get_conn() as conn:
        item = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if item is None:
            raise KeyError(item_id)
        event = conn.execute("SELECT * FROM events WHERE item_id = ?", (item_id,)).fetchone()
        if on_calendar:
            if item["review_status"] != "confirmed":
                raise CalendarRejected(
                    "needs_confirmation",
                    "Confirm this item before adding it to the calendar.",
                )
            if event is None or not event["event_date"]:
                raise CalendarRejected(
                    "needs_event_date",
                    "Add a real event date before putting this on the calendar. An unclear date is not enough.",
                )
            conn.execute("UPDATE events SET on_calendar = 1 WHERE item_id = ?", (item_id,))
        elif event is not None:
            conn.execute("UPDATE events SET on_calendar = 0 WHERE item_id = ?", (item_id,))
        bundle = _item_bundle(conn, item_id)
    if bundle is None:
        raise KeyError(item_id)
    return bundle


def create_manual_item(
    screenshot_id: str,
    *,
    title: str,
    summary: str | None,
    category: str,
    supporting_text: str,
    event_date: str | None,
    location: str | None,
) -> dict:
    now = utc_now()
    item_id = new_id()
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM screenshots WHERE id = ?", (screenshot_id,)).fetchone() is None:
            raise KeyError(screenshot_id)
        conn.execute(
            """
            INSERT INTO items (
                id, screenshot_id, title, summary, category, review_status, supporting_text,
                ambiguities, registration_required, registration_url, registration_deadline,
                registration_status, registration_evidence, created_at, updated_at, confirmed_at
            ) VALUES (?, ?, ?, ?, ?, 'needs_review', ?, NULL, NULL, NULL, NULL, 'unknown', NULL, ?, ?, NULL)
            """,
            (item_id, screenshot_id, title, summary, category, supporting_text or title, now, now),
        )
        if event_date or location:
            conn.execute(
                """
                INSERT INTO events (
                    item_id, event_date, start_time, end_time, timezone, location, meeting_url,
                    on_calendar, date_text, time_text, location_text
                ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, 0, NULL, NULL, ?)
                """,
                (item_id, event_date, location, location),
            )
        bundle = _item_bundle(conn, item_id)
    if bundle is None:
        raise RuntimeError("Manual item was not saved.")
    return bundle


def list_schedule() -> tuple[list[dict], list[dict], list[dict]]:
    with get_conn() as conn:
        tasks = [
            dict(row)
            for row in conn.execute(TASK_SELECT + " WHERE t.status = 'accepted'")
        ]
        events = [
            dict(row)
            for row in conn.execute(
                """
                SELECT e.*, i.title, i.category, i.review_status, i.screenshot_id, i.summary
                FROM events e
                JOIN items i ON i.id = e.item_id
                WHERE e.on_calendar = 1 AND i.review_status = 'confirmed' AND e.event_date IS NOT NULL
                """
            )
        ]
        review_ids = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM items WHERE review_status = 'needs_review' ORDER BY created_at, id"
            )
        ]
        review = [bundle for item_id in review_ids if (bundle := _item_bundle(conn, item_id)) is not None]
    return tasks, events, review


def list_calendar(start: str, end: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT e.*, i.title, i.category, i.review_status, i.screenshot_id, i.summary
            FROM events e
            JOIN items i ON i.id = e.item_id
            WHERE e.on_calendar = 1
              AND i.review_status = 'confirmed'
              AND e.event_date >= ?
              AND e.event_date <= ?
            ORDER BY e.event_date, COALESCE(e.start_time, '99:99'), i.title
            """,
            (start, end),
        ).fetchall()
    return [dict(row) for row in rows]


def list_task_calendar(start: str, end: str) -> list[dict]:
    """Accepted tasks with a deadline in the inclusive range, plus every accepted task with no deadline.

    Comparison uses the YYYY-MM-DD prefix. Date-only values are not parsed as UTC timestamps.
    """
    with get_conn() as conn:
        rows = conn.execute(
            TASK_SELECT
            + """
            WHERE t.status = 'accepted'
              AND (
                    t.deadline IS NULL
                    OR trim(t.deadline) = ''
                    OR (
                        substr(t.deadline, 1, 10) >= ?
                        AND substr(t.deadline, 1, 10) <= ?
                    )
                  )
            ORDER BY COALESCE(substr(t.deadline, 1, 10), '9999-99-99'),
                     COALESCE(t.due_time, '99:99'),
                     t.title,
                     t.id
            """,
            (start, end),
        ).fetchall()
    return [dict(row) for row in rows]
