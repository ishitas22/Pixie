"""Pydantic models for extraction results and the local API."""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class Category(str, Enum):
    CAMPUS_EVENTS = "Campus events"
    CAREER = "Career Opportunities"
    EXTRACURRICULARS = "Extracurriculars"
    PERSONAL = "Personal"
    OTHER = "Other"


class ReviewStatus(str, Enum):
    NEEDS_REVIEW = "needs_review"
    CONFIRMED = "confirmed"


class TaskStatus(str, Enum):
    SUGGESTED = "suggested"
    ACCEPTED = "accepted"
    DISCARDED = "discarded"


class ActionKind(str, Enum):
    EXPLICIT = "explicit"
    SUGGESTION = "suggestion"


class RegistrationState(str, Enum):
    UNKNOWN = "unknown"
    REGISTERED = "registered"
    NOT_REGISTERED = "not_registered"


CATEGORIES = tuple(item.value for item in Category)
_CATEGORY_LOOKUP = {value.casefold(): value for value in CATEGORIES}
_EMPTY = {"", "null", "none", "n/a", "na", "ambiguous", "unknown"}


def canonical_category(value: object) -> str:
    if isinstance(value, Category):
        return value.value
    if isinstance(value, str):
        found = _CATEGORY_LOOKUP.get(value.strip().casefold())
        if found:
            return found
    raise ValueError("unknown category")


def optional_category(value: object) -> Category | None:
    try:
        return Category(canonical_category(value))
    except ValueError:
        return None


class ExtractedTask(BaseModel):
    title: str
    due_date: date | None = None
    due_time: str | None = None
    supporting_text: str
    deadline_text: str | None = None
    kind: ActionKind = ActionKind.EXPLICIT
    date_ambiguous: bool = False


class ExtractedItem(BaseModel):
    title: str
    summary: str | None = None
    category: Category
    supporting_text: str
    ambiguities: str | None = None
    event_date: date | None = None
    event_date_text: str | None = None
    end_date: date | None = None
    end_date_text: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    timezone: str | None = None
    location: str | None = None
    meeting_url: str | None = None
    registration_required: bool | None = None
    registration_url: str | None = None
    registration_deadline: date | None = None
    registration_text: str | None = None
    tasks: list[ExtractedTask] = Field(default_factory=list)


class AcceptTask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str | None = Field(default=None, max_length=1000)
    category: Category
    deadline: date | None = None
    supporting_text: str = Field(min_length=1, max_length=2000)

    @field_validator("title", "supporting_text", mode="before")
    @classmethod
    def strip_required(cls, value: object) -> object:
        if not isinstance(value, str):
            raise ValueError("must be text")
        return value.strip()

    @field_validator("details", mode="before")
    @classmethod
    def blank_details(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("details must be text")
        details = value.strip()
        return details or None

    @field_validator("deadline", mode="before")
    @classmethod
    def blank_deadline(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


class ScreenshotOut(BaseModel):
    id: str
    filename: str
    image_url: str
    ocr_text: str
    created_at: str
    processing_status: str = "ready"
    extraction_error: str | None = None
    visible_urls: list[str] = Field(default_factory=list)
    display_title: str | None = None
    draft_title: str | None = None
    category: Category | None = None
    draft_category: Category | None = None
    summary: str | None = None
    ambiguities: str | None = None
    title_locked: bool = False


class EventOut(BaseModel):
    event_date: date | None = None
    end_date: date | None = None
    date_text: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    timezone: str | None = None
    location: str | None = None
    meeting_url: str | None = None
    on_calendar: bool = False
    time_text: str | None = None
    location_text: str | None = None


class RegistrationOut(BaseModel):
    required: bool | None = None
    url: str | None = None
    deadline: date | None = None
    status: RegistrationState = RegistrationState.UNKNOWN
    evidence: str | None = None


class TaskOut(BaseModel):
    id: str
    screenshot_id: str
    item_id: str | None = None
    title: str
    details: str | None = None
    category: Category
    deadline: date | None = None
    due_time: str | None = None
    deadline_text: str | None = None
    supporting_text: str
    status: TaskStatus = TaskStatus.ACCEPTED
    kind: ActionKind = ActionKind.EXPLICIT
    completed: bool
    created_at: str
    completed_at: str | None = None
    image_url: str
    filename: str
    source_title: str = "Untitled screenshot"
    date_ambiguous: bool = False
    event_date: date | None = None


class ItemOut(BaseModel):
    id: str
    screenshot_id: str
    title: str
    summary: str | None = None
    category: Category
    review_status: ReviewStatus
    supporting_text: str
    ambiguities: str | None = None
    missing: list[str] = Field(default_factory=list)
    registration: RegistrationOut
    event: EventOut | None = None
    tasks: list[TaskOut] = Field(default_factory=list)
    created_at: str
    updated_at: str
    confirmed_at: str | None = None


class ScreenshotDetail(ScreenshotOut):
    items: list[ItemOut] = Field(default_factory=list)


class GalleryImage(BaseModel):
    id: str
    filename: str
    title: str = "Untitled screenshot"
    image_url: str
    created_at: str
    processing_status: str
    extraction_error: str | None = None
    categories: list[str]
    item_count: int
    needs_review: bool


class SimilarImage(BaseModel):
    id: str
    filename: str
    title: str
    image_url: str
    distance: int


class ImportResponse(BaseModel):
    screenshot: ScreenshotDetail
    notice: str | None = None
    similar: list[SimilarImage] = Field(default_factory=list)


class AcceptRequest(BaseModel):
    screenshot_id: str
    tasks: list[AcceptTask] = Field(min_length=1, max_length=20)


class ApproveItem(BaseModel):
    id: str
    title: str | None = None
    summary: str | None = None
    event_date: date | None = None
    end_date: date | None = None
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = None
    meeting_url: str | None = None

    @field_validator("title", "summary", "location", "meeting_url", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("event_date", "end_date", mode="before")
    @classmethod
    def blank_date(cls, value: object) -> object:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


class ApproveTaskEdit(BaseModel):
    id: str
    title: str | None = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class ApproveRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: Category
    summary: str | None = Field(default=None, max_length=240)
    ambiguities: str | None = Field(default=None, max_length=300)
    task_ids: list[str] = Field(default_factory=list, max_length=20)
    tasks: list[ApproveTaskEdit] = Field(default_factory=list, max_length=20)
    items: list[ApproveItem] = Field(default_factory=list, max_length=8)

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: object) -> object:
        if not isinstance(value, str):
            raise ValueError("must be text")
        return value.strip()

    @field_validator("summary", "ambiguities", mode="before")
    @classmethod
    def blank_optional(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class AcceptResponse(BaseModel):
    tasks: list[TaskOut]


class TaskPatch(BaseModel):
    completed: bool | None = None
    status: TaskStatus | None = None
    title: str | None = None
    details: str | None = None
    due_date: date | None = None
    deadline: date | None = None
    due_time: str | None = None
    supporting_text: str | None = None

    @field_validator("title", "supporting_text", "details", "due_time", mode="before")
    @classmethod
    def blank_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("due_date", "deadline", mode="before")
    @classmethod
    def blank_date(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


class ItemUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    category: Category | None = None
    supporting_text: str | None = None
    ambiguities: str | None = None
    event_date: date | None = None
    end_date: date | None = None
    date_text: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    timezone: str | None = None
    location: str | None = None
    meeting_url: str | None = None
    registration_required: bool | None = None
    registration_url: str | None = None
    registration_deadline: date | None = None
    registration_status: RegistrationState | None = None
    registration_evidence: str | None = None

    @field_validator(
        "title",
        "summary",
        "supporting_text",
        "ambiguities",
        "date_text",
        "start_time",
        "end_time",
        "timezone",
        "location",
        "meeting_url",
        "registration_url",
        "registration_evidence",
        mode="before",
    )
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("event_date", "registration_deadline", mode="before")
    @classmethod
    def blank_date(cls, value: object) -> object:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


class ManualItem(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = None
    category: Category = Category.OTHER
    supporting_text: str = ""
    event_date: date | None = None
    location: str | None = None

    @field_validator("title", "summary", "supporting_text", "location", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped
        return value

    @field_validator("event_date", mode="before")
    @classmethod
    def blank_date(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str | None = None
    due_date: date | None = None
    due_time: str | None = None
    supporting_text: str = ""

    @field_validator("title", "details", "supporting_text", "due_time", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("due_date", mode="before")
    @classmethod
    def blank_date(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


class CalendarUpdate(BaseModel):
    on_calendar: bool


class ServiceState(BaseModel):
    ok: bool
    message: str


class HealthResponse(BaseModel):
    ok: bool
    ollama: ServiceState
    tesseract: ServiceState
    categories: list[str]
    timezone: str


class DashboardTask(BaseModel):
    id: str
    item_id: str | None = None
    screenshot_id: str
    title: str
    category: str
    deadline: date | None = None
    due_time: str | None = None
    completed: bool


class DashboardEvent(BaseModel):
    item_id: str
    screenshot_id: str
    title: str
    category: str
    event_date: date
    start_time: str | None = None
    end_time: str | None = None
    timezone: str | None = None
    location: str | None = None
    meeting_url: str | None = None


class DashboardResponse(BaseModel):
    timezone: str
    today_date: date
    today_events: list[DashboardEvent]
    today_tasks: list[DashboardTask]
    overdue_tasks: list[DashboardTask]
    upcoming_events: list[DashboardEvent]
    upcoming_tasks: list[DashboardTask]
    undated_tasks: list[DashboardTask]
    needs_review: list[ItemOut]


class CalendarTaskOut(BaseModel):
    id: str
    screenshot_id: str
    item_id: str | None = None
    title: str
    details: str | None = None
    category: Category
    deadline: date | None = None
    due_time: str | None = None
    deadline_text: str | None = None
    supporting_text: str
    completed: bool
    overdue: bool = False
    date_needs_review: bool = False
    image_url: str
    filename: str
    source_title: str = "Untitled screenshot"


class TaskCalendarResponse(BaseModel):
    timezone: str
    today: date
    tasks: list[CalendarTaskOut]
    undated: list[CalendarTaskOut]
    needs_date_review: list[CalendarTaskOut]


class GoogleCalendarLink(BaseModel):
    url: str
