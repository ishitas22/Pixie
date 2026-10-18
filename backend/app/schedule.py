"""Date comparisons for Today, Upcoming, and overdue lists. No model calls."""

from datetime import date


def missing_information(item: dict, event: dict | None) -> list[str]:
    notes: list[str] = []
    ambiguities = (item.get("ambiguities") or "").strip()
    if ambiguities:
        notes.append(ambiguities)
    if event and event.get("date_text") and not event.get("event_date"):
        notes.append(f"Date needs review: {event['date_text']}")
    elif event and not event.get("event_date") and (
        event.get("location") or event.get("start_time") or event.get("meeting_url")
    ):
        notes.append("Event date")
    if event and event.get("event_date") and not event.get("location") and not event.get("meeting_url"):
        notes.append("Location")
    required = item.get("registration_required")
    if required in (1, True) and not item.get("registration_deadline"):
        notes.append("Registration deadline")
    return notes


def _parse_day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def build_dashboard(
    *,
    today: date,
    tasks: list[dict],
    events: list[dict],
    review_items: list[dict],
) -> dict:
    """Split stored rows by calendar date. Date-only values are not timezone-shifted."""
    today_events = []
    upcoming_events = []
    for event in events:
        event_day = _parse_day(event.get("event_date"))
        if event_day is None or not event.get("on_calendar"):
            continue
        if event.get("review_status") not in (None, "confirmed"):
            continue
        if event_day == today:
            today_events.append(event)
        elif event_day > today:
            upcoming_events.append(event)
    today_events.sort(key=lambda row: (row.get("start_time") or "99:99", row.get("title") or ""))
    upcoming_events.sort(key=lambda row: (row.get("event_date") or "", row.get("start_time") or "99:99"))

    today_tasks = []
    overdue = []
    upcoming_tasks = []
    undated = []
    for task in tasks:
        if task.get("status") != "accepted" or task.get("completed"):
            continue
        due = _parse_day(task.get("deadline"))
        if due is None and task.get("date_ambiguous") in (1, True):
            continue
        if due is None:
            undated.append(task)
        elif due == today:
            today_tasks.append(task)
        elif due < today:
            overdue.append(task)
        else:
            upcoming_tasks.append(task)
    overdue.sort(key=lambda row: (row.get("deadline") or "", row.get("title") or ""))
    upcoming_tasks.sort(key=lambda row: (row.get("deadline") or "", row.get("due_time") or ""))
    return {
        "today_events": today_events,
        "today_tasks": today_tasks,
        "overdue_tasks": overdue,
        "upcoming_events": upcoming_events,
        "upcoming_tasks": upcoming_tasks,
        "undated_tasks": undated,
        "needs_review": review_items,
    }
