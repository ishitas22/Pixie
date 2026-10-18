"""Prefill links for Google Calendar. Pixie does not call Google or save the event.

Timed values use Google's local form YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS plus ctz set to the
event's IANA timezone. When the event has no timezone, ctz is America/New_York. Those clock
values are the confirmed local times. They are not converted through UTC, so a 14:00 start
stays 14:00 in the prefilled form.

The link only opens a form. The user reviews it and saves it in Google Calendar.
"""

import re
from datetime import date
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

GOOGLE_EVENT_TEMPLATE = "https://calendar.google.com/calendar/r/eventedit"
_CLOCK = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class GoogleCalendarError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _clock(value: str, code: str) -> str:
    if not _CLOCK.fullmatch(value):
        raise GoogleCalendarError(code, "Use a time as HH:MM.")
    return value


def _stamp(day: date, clock: str) -> str:
    hour, minute = clock.split(":")
    return f"{day:%Y%m%d}T{hour}{minute}00"


def export_details(
    *,
    title: str,
    summary: str | None,
    category: str | None,
    meeting_url: str | None = None,
    location: str | None = None,
) -> str:
    """Short description for the Google form. Never the screenshot, OCR, or a file path."""
    lines: list[str] = []
    cleaned_title = " ".join(title.split())
    if cleaned_title:
        lines.append(cleaned_title)
    cleaned_summary = " ".join((summary or "").split())
    if cleaned_summary and cleaned_summary != cleaned_title:
        lines.append(cleaned_summary)
    if category and category.strip():
        lines.append(category.strip())
    link = (meeting_url or "").strip()
    place = (location or "").strip()
    if link and link != place:
        lines.append(link)
    return "\n".join(lines)[:1000]


def google_calendar_url(
    *,
    title: str,
    event_date: date | None,
    start_time: str | None,
    end_date: date | None = None,
    end_time: str | None = None,
    timezone_name: str | None = None,
    location: str | None = None,
    meeting_url: str | None = None,
    summary: str | None = None,
    category: str | None = None,
    default_timezone: str = "America/New_York",
) -> str:
    """Build a prefilled Google Calendar template URL. Raises GoogleCalendarError when incomplete."""
    cleaned_title = " ".join((title or "").split())
    if not cleaned_title:
        raise GoogleCalendarError("needs_title", "Add a title before opening Google Calendar.")
    if event_date is None:
        raise GoogleCalendarError(
            "needs_event_date",
            "Add a real event date before opening Google Calendar. An unclear date is not enough.",
        )
    if not (start_time or "").strip():
        raise GoogleCalendarError("needs_start_time", "Add a start time before opening Google Calendar.")
    start = _clock(start_time.strip(), "invalid_time")
    place = (location or "").strip() or (meeting_url or "").strip()
    if not place:
        raise GoogleCalendarError(
            "needs_location",
            "Add a location or meeting link before opening Google Calendar.",
        )
    if not (end_time or "").strip():
        raise GoogleCalendarError(
            "needs_end_time",
            "Confirm an end time before opening Google Calendar. A suggested duration is not a time from the screenshot.",
        )
    end_clock = _clock(end_time.strip(), "invalid_time")
    end_day = end_date or event_date
    if end_day < event_date or (end_day == event_date and end_clock <= start):
        raise GoogleCalendarError("invalid_end_time", "Choose an end after the start.")
    zone = (timezone_name or "").strip() or default_timezone
    try:
        ZoneInfo(zone)
    except ZoneInfoNotFoundError as exc:
        raise GoogleCalendarError("invalid_timezone", "Use an IANA timezone such as America/New_York.") from exc
    details = export_details(
        title=cleaned_title,
        summary=summary,
        category=category,
        meeting_url=meeting_url,
        location=location,
    )
    query = urlencode(
        {
            "action": "TEMPLATE",
            "text": cleaned_title,
            "dates": f"{_stamp(event_date, start)}/{_stamp(end_day, end_clock)}",
            "ctz": zone,
            "location": place,
            "details": details,
        }
    )
    return f"{GOOGLE_EVENT_TEMPLATE}?{query}"
