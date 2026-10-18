"""In-app calendar of accepted task deadlines.

Events are not placed on this grid. A date-only deadline stays on that calendar day.
It becomes overdue only after that day has ended in the user's timezone. An unparsed
deadline is flagged for review and is not treated as a normal undated task.
"""

from datetime import date, timedelta


def month_grid(year: int, month: int) -> list[date]:
    """Sunday-through-Saturday cells covering the month, including adjacent-month days.

    October 2026 begins on Thursday, so the grid starts on Sunday 2026-09-27.
    Cells are calendar dates. They are not created by parsing YYYY-MM-DD as UTC.
    """
    if month < 1 or month > 12:
        raise ValueError("month must be 1..12")
    first = date(year, month, 1)
    # date.weekday() is Monday=0 … Sunday=6. Sunday-start offset is (weekday + 1) % 7.
    start = first - timedelta(days=(first.weekday() + 1) % 7)
    next_first = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    last = next_first - timedelta(days=1)
    # Saturday is weekday 5, so the grid ends on that Saturday.
    end = last + timedelta(days=(5 - last.weekday()) % 7)
    days: list[date] = []
    cursor = start
    while cursor <= end:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


def deadline_day(value: object) -> date | None:
    """Read a stored YYYY-MM-DD (or datetime string prefix) without a UTC shift."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if len(text) < 10:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def is_task_overdue(
    deadline: date | None,
    due_time: str | None,
    today: date,
    *,
    completed: bool,
    now_clock: str | None = None,
) -> bool:
    """A date-only deadline is overdue only after that calendar day has ended.

    A timed deadline on today is overdue after that HH:MM. Completing a task clears overdue.
    """
    if completed or deadline is None or deadline > today:
        return False
    if deadline < today:
        return True
    if not due_time or not now_clock:
        return False
    return due_time < now_clock


def date_needs_review(row: dict) -> bool:
    """An unparsed deadline is not the same as a task the user left undated.

    `date_ambiguous` is the stored flag. A deadline note with no resolved day is the
    same situation: the wording was seen, but no calendar day was confirmed.
    """
    if deadline_day(row.get("deadline")) is not None:
        return False
    raw = row.get("deadline")
    if isinstance(raw, str) and raw.strip():
        return True
    if row.get("date_ambiguous") in (1, True, "1"):
        return True
    return bool(str(row.get("deadline_text") or "").strip())


def split_task_calendar(
    rows: list[dict],
    *,
    start: date,
    end: date,
    today: date,
    now_clock: str | None = None,
) -> dict[str, list[dict]]:
    """Split accepted tasks into dated (inside the inclusive range), undated, and needs review."""
    dated: list[dict] = []
    undated: list[dict] = []
    review: list[dict] = []
    for row in rows:
        if row.get("status") not in (None, "accepted"):
            continue
        if date_needs_review(row):
            review.append(row)
            continue
        day = deadline_day(row.get("deadline"))
        if day is None:
            undated.append(row)
            continue
        if start <= day <= end:
            dated.append(row)
    dated.sort(key=lambda row: (row.get("deadline") or "", row.get("due_time") or "99:99", row.get("title") or ""))
    undated.sort(key=lambda row: (row.get("title") or "", row.get("id") or ""))
    review.sort(key=lambda row: (row.get("title") or "", row.get("id") or ""))
    return {"tasks": dated, "undated": undated, "needs_date_review": review, "today": today, "now_clock": now_clock}
