"""Calendar-date and clock parsing that does not invent years or shift date-only values."""

import re
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_EMPTY = {"", "null", "none", "n/a", "na", "ambiguous", "unknown"}
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_RELATIVE = re.compile(
    r"\b(tomorrow|today|tonight|yesterday|next week|next month|this week|this month)\b",
    re.IGNORECASE,
)
_WEEKDAY = re.compile(
    r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
    re.IGNORECASE,
)
_CLOCK_12 = re.compile(
    r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b",
    re.IGNORECASE,
)
_CLOCK_24 = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
_URL = re.compile(r"https?://[^\s<>'\"\]]+", re.IGNORECASE)
_NOT_REQUIRED = re.compile(
    r"\b(no registration|registration (is )?not required|no rsvp|rsvp not required)\b",
    re.IGNORECASE,
)
_REQUIRED = re.compile(
    r"\b(registration (is )?required|rsvp required|sign[- ]?up required|must (register|sign up|rsvp))\b",
    re.IGNORECASE,
)
_TIMEZONES = (
    (re.compile(r"\b(eastern|e\.?s\.?t\.?|e\.?d\.?t\.?|et)\b", re.IGNORECASE), "America/New_York"),
    (re.compile(r"\b(central|c\.?s\.?t\.?|c\.?d\.?t\.?|ct)\b", re.IGNORECASE), "America/Chicago"),
    (re.compile(r"\b(mountain|m\.?s\.?t\.?|m\.?d\.?t\.?|mt)\b", re.IGNORECASE), "America/Denver"),
    (re.compile(r"\b(pacific|p\.?s\.?t\.?|p\.?d\.?t\.?|pt)\b", re.IGNORECASE), "America/Los_Angeles"),
    (re.compile(r"\b(utc|gmt)\b", re.IGNORECASE), "UTC"),
)


def parse_iso_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        parsed = value
    elif isinstance(value, str):
        text = value.strip()
        if not text or text.casefold() in _EMPTY:
            return None
        candidate = text[:10] if len(text) >= 10 and text[4] == "-" and text[7] == "-" else text
        try:
            parsed = date.fromisoformat(candidate)
        except ValueError:
            return None
    else:
        return None
    if not 2000 <= parsed.year <= 2100:
        return None
    return parsed


def year_in_text(year: int, text: str) -> bool:
    return re.search(rf"\b{year}\b", text) is not None


def ambiguous_wording(text: str | None) -> bool:
    """Relative or weekday-only wording is not a usable calendar date."""
    if not text:
        return False
    if _ISO.search(text) or _YEAR.search(text):
        return False
    if _RELATIVE.search(text):
        return True
    return bool(_WEEKDAY.search(text) and not re.search(r"\d", text))


_MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
_WRITTEN = re.compile(
    r"\b(january|february|march|april|may|june|july|august|september|october|november|december)"
    r"\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b",
    re.IGNORECASE,
)


def written_calendar_dates(text: str) -> list[date]:
    """Dates whose year is written as an ISO date or a month name. No year is invented."""
    found: list[tuple[int, date]] = []
    for match in _ISO.finditer(text or ""):
        parsed = parse_iso_date(match.group(0))
        if parsed:
            found.append((match.start(), parsed))
    for match in _WRITTEN.finditer(text or ""):
        month = _MONTHS[match.group(1).casefold()]
        try:
            parsed = date(int(match.group(3)), month, int(match.group(2)))
        except ValueError:
            continue
        if 2000 <= parsed.year <= 2100:
            found.append((match.start(), parsed))
    found.sort(key=lambda item: item[0])
    ordered: list[date] = []
    for _, parsed in found:
        if parsed not in ordered:
            ordered.append(parsed)
    return ordered


def resolve_calendar_date(
    raw: object,
    wording: str | None,
    ocr_text: str,
) -> tuple[date | None, str | None]:
    """Keep a date only when that year is written in the source. Preserve other wording."""
    kept = wording.strip() if isinstance(wording, str) and wording.strip() else None
    if kept and not _snippet_in_text(kept, ocr_text):
        kept = None
    parsed = parse_iso_date(raw)
    written_dates = written_calendar_dates(kept) if kept else []
    written = written_dates[0] if written_dates else None
    if written is not None and (parsed is None or (kept and parsed.isoformat() not in kept)):
        parsed = written
    if parsed is None or ambiguous_wording(kept) or not year_in_text(parsed.year, ocr_text):
        return None, kept
    if kept:
        agrees = written == parsed or parsed.isoformat() in kept
        if not agrees:
            return None, kept
    elif parsed.isoformat() not in ocr_text and parsed not in written_calendar_dates(ocr_text):
        return None, kept
    return parsed, kept


def parse_clocks(text: str) -> list[str]:
    found: list[str] = []
    for match in _CLOCK_12.finditer(text):
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        suffix = match.group(3).lower().replace(".", "")
        if hour > 12 or minute > 59:
            continue
        if suffix == "pm" and hour < 12:
            hour += 12
        elif suffix == "am" and hour == 12:
            hour = 0
        found.append(f"{hour:02d}:{minute:02d}")
    if found:
        return found
    for match in _CLOCK_24.finditer(text):
        found.append(f"{int(match.group(1)):02d}:{match.group(2)}")
    return found


def grounded_clocks(evidence: str | None, ocr_text: str) -> list[str]:
    if not evidence or not _snippet_in_text(evidence, ocr_text):
        return []
    return parse_clocks(evidence)


def normalize_user_time(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("time must be HH:MM")
    text = value.strip()
    if not text:
        return None
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", text):
        raise ValueError("use HH:MM")
    return text


def grounded_timezone(evidence: str | None, ocr_text: str) -> str | None:
    if not evidence or not _snippet_in_text(evidence, ocr_text):
        return None
    for pattern, name in _TIMEZONES:
        if pattern.search(evidence):
            return name
    return None


def visible_urls(text: str) -> list[str]:
    found: list[str] = []
    for match in _URL.findall(text or ""):
        cleaned = match.rstrip(".,)")
        if cleaned not in found:
            found.append(cleaned)
    return found


def grounded_url(candidate: object, ocr_text: str) -> str | None:
    if not isinstance(candidate, str) or not candidate.strip():
        return None
    wanted = candidate.strip().rstrip(".,)")
    for url in visible_urls(ocr_text):
        if url == wanted or wanted.startswith(url) or url.startswith(wanted):
            return url
    return None


def registration_requirement(evidence: str) -> bool | None:
    if _NOT_REQUIRED.search(evidence):
        return False
    if _REQUIRED.search(evidence):
        return True
    return None


def resolve_timezone_name(name: str | None, default: str) -> str:
    chosen = (name or "").strip() or default
    try:
        ZoneInfo(chosen)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(chosen) from exc
    return chosen


def local_today(timezone_name: str, now: datetime | None = None) -> date:
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(ZoneInfo(timezone_name)).date()


def _snippet_in_text(snippet: str, text: str) -> bool:
    needle = re.sub(r"\s+", " ", snippet).strip().casefold()
    haystack = re.sub(r"\s+", " ", text).strip().casefold()
    return len(needle) >= 3 and needle in haystack
