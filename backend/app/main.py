"""Local FastAPI service for Pixie. Bind this to 127.0.0.1:8000."""

import logging
import re
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app import database, extractor, images, ocr, qr, similarity
from app.calendar_view import date_needs_review, deadline_day, is_task_overdue, split_task_calendar
from app.config import DEFAULT_TIMEZONE, MAX_IMAGE_BYTES, frontend_origins, image_dir
from app.dates import local_today, normalize_user_time, resolve_timezone_name, visible_urls
from app.google_calendar import GoogleCalendarError, google_calendar_url
from app.schedule import build_dashboard, missing_information
from app.schemas import (
    CATEGORIES,
    ActionKind,
    AcceptRequest,
    AcceptResponse,
    ApproveRequest,
    CalendarTaskOut,
    CalendarUpdate,
    Category,
    GoogleCalendarLink,
    DashboardEvent,
    DashboardResponse,
    DashboardTask,
    TaskCalendarResponse,
    EventOut,
    GalleryImage,
    HealthResponse,
    ImportResponse,
    ItemOut,
    SimilarImage,
    ItemUpdate,
    ManualItem,
    RegistrationOut,
    RegistrationState,
    ReviewStatus,
    ScreenshotDetail,
    optional_category,
    QrCodeOut,
    ScreenshotOut,
    ServiceState,
    TaskCreate,
    TaskOut,
    TaskPatch,
    TaskStatus,
)

logger = logging.getLogger("pixie")


def configure_logging() -> None:
    """Show concise Pixie logs in the API process without dumping screenshot text."""
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
        logger.addHandler(handler)
    logger.propagate = False


configure_logging()
STORED_NAME_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$"
)


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        screenshot: ScreenshotOut | None = None,
        similar: list[SimilarImage] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.screenshot = screenshot
        self.similar = similar or []


@asynccontextmanager
async def lifespan(_app: FastAPI):
    database.init_db()
    backfill_image_hashes()
    logger.info("Pixie data directory: %s", image_dir().parent)
    yield


app = FastAPI(title="Pixie", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


@app.exception_handler(ApiError)
def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
    payload: dict = {"error": exc.code, "message": exc.message}
    if exc.screenshot is not None:
        payload["screenshot"] = exc.screenshot.model_dump(mode="json")
    if exc.similar:
        payload["similar"] = [item.model_dump(mode="json") for item in exc.similar]
    return JSONResponse(status_code=exc.status_code, content=payload)


def stored_date(value: object) -> date | None:
    if not value or not isinstance(value, str):
        return None
    return date.fromisoformat(value[:10])


def image_link(screenshot_id: str) -> str:
    return f"/api/screenshots/{screenshot_id}/image"


def task_out(row: dict) -> TaskOut:
    return TaskOut(
        id=row["id"],
        screenshot_id=row["screenshot_id"],
        item_id=row.get("item_id"),
        title=row["title"],
        details=row.get("details"),
        category=Category(row["category"]),
        deadline=stored_date(row.get("deadline")),
        due_time=row.get("due_time"),
        deadline_text=row.get("deadline_text"),
        supporting_text=row["supporting_text"],
        status=TaskStatus(row.get("status") or "accepted"),
        kind=ActionKind(row["kind"]) if row.get("kind") in ("explicit", "suggestion") else ActionKind.EXPLICIT,
        completed=bool(row["completed"]),
        created_at=row["created_at"],
        completed_at=row.get("completed_at"),
        image_url=image_link(row["screenshot_id"]),
        filename=row["filename"],
        source_title=database.presentation_title(
            display_title=row.get("display_title"),
            draft_title=row.get("draft_title"),
            item_title=row.get("item_title"),
            locked=bool(row.get("approved_at")),
        ),
        date_ambiguous=bool(row.get("date_ambiguous")),
        event_date=stored_date(row.get("event_date")),
        link_url=row.get("link_url") or None,
        link_label=row.get("link_label") or None,
    )


def event_out(row: dict) -> EventOut:
    return EventOut(
        event_date=stored_date(row.get("event_date")),
        end_date=stored_date(row.get("end_date")),
        date_text=row.get("date_text"),
        start_time=row.get("start_time"),
        end_time=row.get("end_time"),
        timezone=row.get("timezone"),
        location=row.get("location"),
        meeting_url=row.get("meeting_url"),
        on_calendar=bool(row.get("on_calendar")),
        time_text=row.get("time_text"),
        location_text=row.get("location_text"),
    )


def item_out(row: dict) -> ItemOut:
    required = row.get("registration_required")
    return ItemOut(
        id=row["id"],
        screenshot_id=row["screenshot_id"],
        title=row["title"],
        summary=row.get("summary"),
        category=Category(row["category"]),
        review_status=ReviewStatus(row["review_status"]),
        supporting_text=row["supporting_text"],
        ambiguities=row.get("ambiguities"),
        missing=missing_information(row, row.get("event")),
        registration=RegistrationOut(
            required=None if required is None else bool(required),
            url=row.get("registration_url"),
            deadline=stored_date(row.get("registration_deadline")),
            status=RegistrationState(row.get("registration_status") or "unknown"),
            evidence=row.get("registration_evidence"),
        ),
        event=event_out(row["event"]) if row.get("event") else None,
        tasks=[task_out(task) for task in row.get("tasks") or []],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        confirmed_at=row.get("confirmed_at"),
    )


def qr_code_out(record: dict) -> QrCodeOut:
    payload = record.get("payload") or ""
    readable = bool(record.get("readable"))
    clickable = readable and qr.is_clickable_link(payload)
    return QrCodeOut(
        id=record["id"],
        payload=payload,
        readable=readable,
        is_url=clickable,
        domain=qr.link_label(payload) if clickable else None,
    )


def _store_qr(screenshot_id: str, stored_name: str) -> None:
    """Read QR codes from the saved image. Failure leaves OCR and tasks alone."""
    try:
        codes = qr.scan_image(image_dir() / stored_name)
        database.replace_qr_codes(
            screenshot_id,
            [(code.payload, code.readable) for code in codes],
        )
    except Exception:
        logger.exception("QR scan failed screenshot=%s", screenshot_id)


def screenshot_detail(row: dict) -> ScreenshotDetail:
    locked = bool(row.get("approved_at")) or any(
        item.get("review_status") == "confirmed" for item in row.get("items") or []
    )
    records = database.list_qr_codes(row["id"])
    codes = [qr_code_out(record) for record in records]
    return ScreenshotDetail(
        id=row["id"],
        filename=row["original_filename"],
        image_url=image_link(row["id"]),
        ocr_text=row.get("ocr_text") or "",
        created_at=row["created_at"],
        processing_status=row.get("processing_status") or "ready",
        extraction_error=row.get("extraction_error"),
        visible_urls=visible_urls(row.get("ocr_text") or ""),
        qr_codes=codes,
        qr_note=qr.UNREADABLE_NOTE if any(not code.readable for code in codes) else None,
        display_title=row.get("display_title"),
        draft_title=row.get("draft_title"),
        category=optional_category(row.get("category")),
        draft_category=optional_category(row.get("draft_category")),
        summary=row.get("summary"),
        ambiguities=row.get("ambiguities"),
        title_locked=locked,
        items=[item_out(item) for item in row.get("items") or []],
    )


def load_detail(screenshot_id: str) -> ScreenshotDetail:
    bundle = database.get_bundle(screenshot_id)
    if bundle is None:
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    return screenshot_detail(bundle)


def image_file(stored_name: str) -> Path:
    if not STORED_NAME_RE.fullmatch(stored_name):
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    path = (image_dir() / stored_name).resolve()
    root = image_dir().resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    return path


def remove_stored_image(stored_name: str) -> None:
    if not STORED_NAME_RE.fullmatch(stored_name or ""):
        logger.warning("Skipped deleting an unexpected image name")
        return
    path = (image_dir() / stored_name).resolve()
    root = image_dir().resolve()
    if not path.is_relative_to(root):
        return
    path.unlink(missing_ok=True)


def hash_stored_row(row: dict) -> str | None:
    """Hash one saved file and store it. Missing or unreadable files are left in place."""
    stored_name = row.get("stored_name") or ""
    if not isinstance(stored_name, str) or not STORED_NAME_RE.fullmatch(stored_name):
        return None
    path = image_dir() / stored_name
    if not path.is_file():
        return None
    try:
        digest = similarity.perceptual_hash(path.read_bytes())
    except (OSError, ValueError):
        logger.exception("Could not hash screenshot %s", row.get("id"))
        return None
    database.set_image_hash(str(row["id"]), digest)
    return digest


def backfill_image_hashes() -> None:
    for row in database.screenshots_missing_hash():
        hash_stored_row(row)


def similarity_matches(screenshot_id: str, digest: str | None) -> list[SimilarImage]:
    if not isinstance(digest, str) or not similarity.is_hash(digest):
        return []
    found: list[SimilarImage] = []
    for row in database.list_similarity_candidates():
        if row["id"] == screenshot_id:
            continue
        other = row.get("image_hash") or ""
        if not similarity.is_hash(other):
            other = hash_stored_row(row)
        if not isinstance(other, str):
            continue
        distance = similarity.hamming_distance(digest, other)
        if distance is None or distance > similarity.SIMILAR_MAX_DISTANCE:
            continue
        found.append(
            SimilarImage(
                id=row["id"],
                filename=row["original_filename"],
                title=database.presentation_title(
                    display_title=row.get("display_title"),
                    draft_title=row.get("draft_title"),
                    item_title=None,
                    locked=bool(row.get("approved_at")),
                ),
                image_url=image_link(row["id"]),
                distance=distance,
            )
        )
    found.sort(key=lambda item: (item.distance, item.id))
    return found


def checked_time(value: str | None) -> str | None:
    try:
        return normalize_user_time(value)
    except ValueError as exc:
        raise ApiError(422, "invalid_time", "Use a time as HH:MM.") from exc


def checked_zone(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return resolve_timezone_name(value, value)
    except ValueError as exc:
        raise ApiError(400, "invalid_timezone", "Use an IANA timezone such as America/New_York.") from exc


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "Pixie",
        "message": "Local API is running. Open the Expo web app at http://localhost:8081.",
    }


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    tesseract_ok, tesseract_message = ocr.check_tesseract()
    ollama_ok, ollama_message = extractor.check_ollama()
    return HealthResponse(
        ok=tesseract_ok and ollama_ok,
        ollama=ServiceState(ok=ollama_ok, message=ollama_message),
        tesseract=ServiceState(ok=tesseract_ok, message=tesseract_message),
        categories=list(CATEGORIES),
        timezone=DEFAULT_TIMEZONE,
    )


def _finish_import(
    screenshot_id: str,
    notice: str | None,
    similar: list[SimilarImage] | None = None,
) -> ImportResponse:
    return ImportResponse(
        screenshot=load_detail(screenshot_id),
        notice=notice,
        similar=similar or [],
    )


@app.post("/api/screenshots", response_model=ImportResponse)
def import_screenshot(file: UploadFile = File(...)) -> ImportResponse:
    try:
        data = file.file.read(MAX_IMAGE_BYTES + 1)
    finally:
        file.file.close()

    try:
        valid = images.validate_image(
            data,
            filename=file.filename or "",
            content_type=file.content_type or "",
        )
    except images.ImageRejected as exc:
        status = 413 if exc.code == "file_too_large" else 400
        raise ApiError(status, exc.code, exc.message) from exc

    filename = images.display_filename(file.filename or "screenshot", valid.extension)
    row: dict | None = None
    text = ""
    digest: str | None = None
    try:
        digest = similarity.perceptual_hash(valid.data)
    except ValueError:
        logger.exception("Could not hash uploaded screenshot %s", filename)
    try:
        row = database.insert_screenshot(
            original_filename=filename,
            extension=valid.extension,
            media_type=valid.media_type,
            ocr_text="",
            data=valid.data,
            image_hash=digest,
        )
        text = ocr.extract_text(image_dir() / row["stored_name"])
        database.update_ocr(row["id"], text)
        row["ocr_text"] = text
        _store_qr(row["id"], row["stored_name"])
    except ocr.OcrEngineError as exc:
        if row is not None:
            database.set_processing(row["id"], "ocr_failed", str(exc))
            _store_qr(row["id"], row["stored_name"])
        shot = load_detail(row["id"]) if row else None
        matches = similarity_matches(row["id"], digest) if row is not None else []
        raise ApiError(500, "ocr_failed", str(exc), shot, matches) from exc
    except Exception:
        logger.exception("Failed while reading screenshot %s", row["id"] if row else "unsaved")
        raise

    if row is None:
        raise ApiError(500, "ocr_failed", "Tesseract could not read this screenshot.")

    if not ocr.has_readable_text(text):
        message = "No readable text found in this screenshot. Try a clearer image, or add an item yourself."
        database.set_processing(row["id"], "no_text", message)
        matches = similarity_matches(row["id"], digest)
        raise ApiError(422, "no_readable_text", message, load_detail(row["id"]), matches)

    database.set_processing(row["id"], "ocr_complete", None)
    logger.info("OCR completed screenshot=%s characters=%s", row["id"], len(text))
    matches = similarity_matches(row["id"], digest)
    if matches:
        logger.info(
            "Similar screenshots found screenshot=%s matches=%s",
            row["id"],
            len(matches),
        )
    return _finish_import(row["id"], None, matches)


def _interpret(screenshot_id: str) -> ImportResponse:
    row = database.get_screenshot(screenshot_id)
    if row is None:
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    text = row.get("ocr_text") or ""
    if not ocr.has_readable_text(text):
        message = "No readable text found in this screenshot. Try a clearer image, or add an item yourself."
        database.set_processing(screenshot_id, "no_text", message)
        raise ApiError(422, "no_readable_text", message, load_detail(screenshot_id))
    payloads = [
        record["payload"]
        for record in database.list_qr_codes(screenshot_id)
        if record.get("readable") and record.get("payload")
    ]
    try:
        outcome = extractor.extract_items(text, payloads)
    except extractor.OllamaUnavailable as exc:
        database.set_processing(screenshot_id, "model_failed", str(exc))
        raise ApiError(503, "ollama_unavailable", str(exc), load_detail(screenshot_id)) from exc
    except extractor.ExtractionFailed as exc:
        message = str(exc)
        if not message.lower().startswith("interpretation failed"):
            message = (
                "Interpretation failed. The screenshot and its text are saved. "
                "You can enter the details yourself or try again."
            )
        database.set_processing(screenshot_id, "model_failed", message)
        raise ApiError(502, "model_extraction_failed", message, load_detail(screenshot_id)) from exc
    had_items = bool(database.items_for_screenshot(screenshot_id))
    database.store_interpretation(
        screenshot_id,
        outcome.items,
        title=outcome.title,
        category=outcome.category.value if outcome.category else None,
        summary=outcome.summary,
        ambiguities=outcome.ambiguities,
        replace=had_items,
    )
    database.set_processing(screenshot_id, "ready", None)
    notice = None
    if outcome.dropped_ungrounded:
        notice = "Pixie hid details that were not supported by the screenshot text."
        if had_items:
            notice += " Confirmed items and accepted tasks were kept."
    elif not outcome.items:
        notice = "No actions were found. You can still save this screenshot."
    elif had_items:
        notice = "Confirmed items and accepted tasks were kept. Review the new reading before saving it."
    logger.info(
        "Structured result returned screenshot=%s title=%s category=%s items=%s status=ready",
        screenshot_id,
        outcome.title or "",
        outcome.category.value if outcome.category else "",
        len(outcome.items),
    )
    return _finish_import(screenshot_id, notice)


@app.post("/api/screenshots/{screenshot_id}/reanalyze", response_model=ImportResponse)
def reanalyze_screenshot(screenshot_id: str) -> ImportResponse:
    row = database.get_screenshot(screenshot_id)
    if row is None:
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    try:
        text = ocr.extract_text(image_file(row["stored_name"]))
    except ocr.OcrEngineError as exc:
        _store_qr(screenshot_id, row["stored_name"])
        database.set_processing(screenshot_id, "ocr_failed", str(exc))
        raise ApiError(500, "ocr_failed", str(exc), load_detail(screenshot_id)) from exc
    if not ocr.has_readable_text(text):
        message = "No readable text found in this screenshot. Try a clearer image, or add an item yourself."
        database.set_processing(screenshot_id, "no_text", message)
        raise ApiError(422, "no_readable_text", message, load_detail(screenshot_id))
    database.update_ocr(screenshot_id, text)
    _store_qr(screenshot_id, row["stored_name"])
    database.set_processing(screenshot_id, "ocr_complete", None)
    logger.info("OCR completed screenshot=%s characters=%s", screenshot_id, len(text))
    return _finish_import(screenshot_id, None)


@app.post("/api/screenshots/{screenshot_id}/interpret", response_model=ImportResponse)
def interpret_screenshot(screenshot_id: str) -> ImportResponse:
    return _interpret(screenshot_id)


@app.get("/api/screenshots", response_model=list[GalleryImage])
def gallery(category: str = "All") -> list[GalleryImage]:
    if category != "All" and category not in CATEGORIES:
        raise ApiError(400, "unknown_category", "Choose one of the Pixie categories, or All.")
    images: list[GalleryImage] = []
    for shot in database.list_gallery():
        categories = shot["categories"]
        if category == "All":
            include = True
        elif category == "Other":
            include = "Other" in categories or not categories
        else:
            include = category in categories
        if not include:
            continue
        images.append(
            GalleryImage(
                id=shot["id"],
                filename=shot["original_filename"],
                title=shot.get("display_name") or "Untitled screenshot",
                image_url=image_link(shot["id"]),
                created_at=shot["created_at"],
                processing_status=shot.get("processing_status") or "ready",
                extraction_error=shot.get("extraction_error"),
                categories=categories,
                item_count=shot["item_count"],
                needs_review=shot["needs_review"],
            )
        )
    return images


@app.get("/api/screenshots/{screenshot_id}", response_model=ScreenshotDetail)
def get_screenshot(screenshot_id: str) -> ScreenshotDetail:
    return load_detail(screenshot_id)


@app.delete("/api/screenshots/{screenshot_id}")
def remove_screenshot(screenshot_id: str) -> dict[str, str]:
    """Delete one screenshot, its image file, and only the items and tasks it owns."""
    row = database.delete_screenshot(screenshot_id)
    if row is None:
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    remove_stored_image(row["stored_name"])
    logger.info("Deleted screenshot=%s", screenshot_id)
    return {"deleted": screenshot_id}


@app.get("/api/screenshots/{screenshot_id}/image")
def get_screenshot_image(screenshot_id: str) -> FileResponse:
    row = database.get_screenshot(screenshot_id)
    if row is None:
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    return FileResponse(image_file(row["stored_name"]), media_type=row["media_type"])


@app.post("/api/screenshots/{screenshot_id}/items", response_model=ItemOut)
def add_manual_item(screenshot_id: str, body: ManualItem) -> ItemOut:
    if not body.title.strip():
        raise ApiError(422, "invalid_item", "Add a title.")
    try:
        item = database.create_manual_item(
            screenshot_id,
            title=body.title.strip(),
            summary=body.summary or None,
            category=body.category.value,
            supporting_text=body.supporting_text.strip(),
            event_date=body.event_date.isoformat() if body.event_date else None,
            location=body.location,
        )
    except KeyError as exc:
        raise ApiError(404, "not_found", "That screenshot could not be found.") from exc
    if database.get_screenshot(screenshot_id):
        database.set_processing(screenshot_id, "ready", None)
    return item_out(item)


@app.get("/api/items/{item_id}", response_model=ItemOut)
def get_item(item_id: str) -> ItemOut:
    item = database.get_item(item_id)
    if item is None:
        raise ApiError(404, "not_found", "That item could not be found.")
    return item_out(item)


@app.patch("/api/items/{item_id}", response_model=ItemOut)
def patch_item(item_id: str, patch: ItemUpdate) -> ItemOut:
    data = patch.model_dump(exclude_unset=True)
    changes: dict = {}
    if "title" in data:
        if not data["title"]:
            raise ApiError(422, "invalid_item", "Add a title.")
        changes["title"] = data["title"]
    for key in ("summary", "ambiguities", "location", "meeting_url", "date_text", "registration_url", "registration_evidence"):
        if key in data:
            changes[key] = data[key]
    if "supporting_text" in data:
        if not data["supporting_text"]:
            raise ApiError(422, "invalid_item", "Supporting text cannot be empty.")
        changes["supporting_text"] = data["supporting_text"]
    if "category" in data and data["category"] is not None:
        changes["category"] = data["category"].value
    if "event_date" in data:
        changes["event_date"] = data["event_date"].isoformat() if data["event_date"] else None
    if "end_date" in data:
        changes["end_date"] = data["end_date"].isoformat() if data["end_date"] else None
    if "registration_deadline" in data:
        changes["registration_deadline"] = (
            data["registration_deadline"].isoformat() if data["registration_deadline"] else None
        )
    if "registration_required" in data:
        value = data["registration_required"]
        changes["registration_required"] = None if value is None else int(bool(value))
    if "registration_status" in data and data["registration_status"] is not None:
        changes["registration_status"] = data["registration_status"].value
    for key in ("start_time", "end_time"):
        if key in data:
            changes[key] = checked_time(data[key])
    if "timezone" in data:
        changes["timezone"] = checked_zone(data["timezone"])
    updated = database.update_item(item_id, changes)
    if updated is None:
        raise ApiError(404, "not_found", "That item could not be found.")
    return item_out(updated)


@app.post("/api/screenshots/{screenshot_id}/approve", response_model=ImportResponse)
def approve_screenshot(screenshot_id: str, body: ApproveRequest) -> ImportResponse:
    if database.get_screenshot(screenshot_id) is None:
        raise ApiError(404, "not_found", "That screenshot could not be found.")
    for item in body.items:
        data = item.model_dump(exclude_unset=True)
        changes: dict = {}
        if data.get("title"):
            changes["title"] = data["title"]
        if "summary" in data:
            changes["summary"] = data["summary"]
        if "location" in data:
            changes["location"] = data["location"]
        if "meeting_url" in data:
            changes["meeting_url"] = data["meeting_url"]
        if "event_date" in data:
            changes["event_date"] = data["event_date"].isoformat() if data["event_date"] else None
        if "end_date" in data:
            changes["end_date"] = data["end_date"].isoformat() if data["end_date"] else None
        for key in ("start_time", "end_time"):
            if key in data:
                changes[key] = checked_time(data[key])
        if not changes:
            continue
        updated = database.update_item(item.id, changes)
        if updated is None or updated["screenshot_id"] != screenshot_id:
            raise ApiError(404, "not_found", "That item could not be found.")
    try:
        database.approve_screenshot(
            screenshot_id,
            title=body.title.strip(),
            category=body.category.value,
            summary=body.summary,
            ambiguities=body.ambiguities,
            task_ids=body.task_ids,
            task_titles={edit.id: edit.title for edit in body.tasks if edit.title},
            task_links={
                edit.id: (edit.link_url, edit.link_label or "Link from QR code.")
                for edit in body.tasks
                if edit.link_url
            },
        )
    except KeyError as exc:
        raise ApiError(404, "not_found", "That screenshot could not be found.") from exc
    return _finish_import(screenshot_id, "Saved.")


@app.post("/api/items/{item_id}/confirm", response_model=ItemOut)
def confirm_item(item_id: str) -> ItemOut:
    item = database.confirm_item(item_id)
    if item is None:
        raise ApiError(404, "not_found", "That item could not be found.")
    return item_out(item)


@app.post("/api/items/{item_id}/calendar", response_model=ItemOut)
def update_calendar(item_id: str, body: CalendarUpdate) -> ItemOut:
    try:
        item = database.set_on_calendar(item_id, body.on_calendar)
    except KeyError as exc:
        raise ApiError(404, "not_found", "That item could not be found.") from exc
    except database.CalendarRejected as exc:
        raise ApiError(400, exc.code, exc.message) from exc
    return item_out(item)


@app.post("/api/items/{item_id}/tasks", response_model=TaskOut)
def add_task(item_id: str, body: TaskCreate) -> TaskOut:
    if not body.title.strip():
        raise ApiError(422, "invalid_task", "Add a title.")
    created = database.add_item_task(
        item_id,
        {
            "title": body.title.strip(),
            "details": body.details or None,
            "deadline": body.due_date.isoformat() if body.due_date else None,
            "due_time": checked_time(body.due_time),
            "supporting_text": body.supporting_text.strip(),
        },
    )
    if created is None:
        raise ApiError(404, "not_found", "That item could not be found.")
    return task_out(created)


@app.get("/api/tasks", response_model=list[TaskOut])
def get_tasks() -> list[TaskOut]:
    return [task_out(row) for row in database.list_tasks()]


@app.post("/api/tasks", response_model=AcceptResponse)
def accept_tasks(request: AcceptRequest) -> AcceptResponse:
    payload = [
        {
            "title": task.title,
            "details": task.details,
            "category": task.category.value,
            "deadline": task.deadline.isoformat() if task.deadline else None,
            "supporting_text": task.supporting_text,
        }
        for task in request.tasks
    ]
    try:
        created = database.insert_tasks(request.screenshot_id, payload)
    except KeyError as exc:
        raise ApiError(404, "screenshot_not_found", "That screenshot is no longer available.") from exc
    return AcceptResponse(tasks=[task_out(row) for row in created])


@app.patch("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: str, patch: TaskPatch) -> TaskOut:
    data = patch.model_dump(exclude_unset=True)
    if "deadline" in data and "due_date" not in data:
        data["due_date"] = data.pop("deadline")
    else:
        data.pop("deadline", None)
    changes: dict = {}
    if "title" in data:
        if not data["title"]:
            raise ApiError(422, "invalid_task", "Add a title.")
        changes["title"] = data["title"]
    if "details" in data:
        changes["details"] = data["details"] or None
    if "supporting_text" in data:
        if not data["supporting_text"]:
            raise ApiError(422, "invalid_task", "Supporting text cannot be empty.")
        changes["supporting_text"] = data["supporting_text"]
    if "due_date" in data:
        if data["due_date"]:
            changes["deadline"] = data["due_date"].isoformat()
            changes["date_ambiguous"] = 0
        else:
            # Clearing a deadline is an explicit "do later", not an unresolved date.
            changes["deadline"] = None
            changes["deadline_text"] = None
            changes["date_ambiguous"] = 0
    if "due_time" in data:
        changes["due_time"] = checked_time(data["due_time"])
    if "status" in data and data["status"] is not None:
        changes["status"] = data["status"].value
    if changes:
        updated = database.update_task(task_id, changes)
        if updated is None:
            raise ApiError(404, "not_found", "That task could not be found.")
    if "completed" in data and data["completed"] is not None:
        updated = database.set_completed(task_id, data["completed"])
        if updated is None:
            raise ApiError(404, "not_found", "That task could not be found.")
        return task_out(updated)
    current = database.update_task(task_id, {})
    if current is None:
        raise ApiError(404, "not_found", "That task could not be found.")
    return task_out(current)


def _dashboard_task(row: dict) -> DashboardTask:
    return DashboardTask(
        id=row["id"],
        item_id=row.get("item_id"),
        screenshot_id=row["screenshot_id"],
        title=row["title"],
        category=row["category"],
        deadline=stored_date(row.get("deadline")),
        due_time=row.get("due_time"),
        completed=bool(row.get("completed")),
    )


def _dashboard_event(row: dict) -> DashboardEvent:
    event_day = stored_date(row.get("event_date"))
    if event_day is None:
        raise ApiError(500, "invalid_event", "A calendar event is missing its date.")
    return DashboardEvent(
        item_id=row["item_id"],
        screenshot_id=row["screenshot_id"],
        title=row["title"],
        category=row["category"],
        event_date=event_day,
        start_time=row.get("start_time"),
        end_time=row.get("end_time"),
        timezone=row.get("timezone"),
        location=row.get("location"),
        meeting_url=row.get("meeting_url"),
    )


@app.get("/api/dashboard", response_model=DashboardResponse)
def dashboard(timezone: str | None = None) -> DashboardResponse:
    zone = checked_zone(timezone) if timezone else DEFAULT_TIMEZONE
    if zone is None:
        zone = DEFAULT_TIMEZONE
    today = local_today(zone)
    tasks, events, review = database.list_schedule()
    built = build_dashboard(today=today, tasks=tasks, events=events, review_items=review)
    return DashboardResponse(
        timezone=zone,
        today_date=today,
        today_events=[_dashboard_event(row) for row in built["today_events"]],
        today_tasks=[_dashboard_task(row) for row in built["today_tasks"]],
        overdue_tasks=[_dashboard_task(row) for row in built["overdue_tasks"]],
        upcoming_events=[_dashboard_event(row) for row in built["upcoming_events"]],
        upcoming_tasks=[_dashboard_task(row) for row in built["upcoming_tasks"]],
        undated_tasks=[_dashboard_task(row) for row in built["undated_tasks"]],
        needs_review=[item_out(row) for row in built["needs_review"]],
    )


@app.get("/api/calendar", response_model=list[DashboardEvent])
def calendar(start: date, end: date, timezone: str | None = None) -> list[DashboardEvent]:
    if timezone:
        checked_zone(timezone)
    if end < start:
        raise ApiError(400, "invalid_range", "The end date must be on or after the start date.")
    return [_dashboard_event(row) for row in database.list_calendar(start.isoformat(), end.isoformat())]


def _calendar_task(row: dict, today: date, *, review: bool) -> CalendarTaskOut:
    day = deadline_day(row.get("deadline"))
    return CalendarTaskOut(
        id=row["id"],
        screenshot_id=row["screenshot_id"],
        item_id=row.get("item_id"),
        title=row["title"],
        details=row.get("details"),
        category=Category(row["category"]),
        deadline=day,
        due_time=row.get("due_time"),
        deadline_text=row.get("deadline_text"),
        supporting_text=row["supporting_text"],
        completed=bool(row["completed"]),
        overdue=is_task_overdue(day, row.get("due_time"), today, completed=bool(row.get("completed"))),
        date_needs_review=review or date_needs_review(row),
        image_url=image_link(row["screenshot_id"]),
        filename=row["filename"],
        source_title=database.presentation_title(
            display_title=row.get("display_title"),
            draft_title=row.get("draft_title"),
            item_title=row.get("item_title"),
            locked=bool(row.get("approved_at")),
        ),
    )


@app.get("/api/task-calendar", response_model=TaskCalendarResponse)
def task_calendar(start: date, end: date, timezone: str | None = None) -> TaskCalendarResponse:
    """Accepted task deadlines in an inclusive date range. Events are not included."""
    zone = checked_zone(timezone) if timezone else DEFAULT_TIMEZONE
    if zone is None:
        zone = DEFAULT_TIMEZONE
    if end < start:
        raise ApiError(400, "invalid_range", "The end date must be on or after the start date.")
    today = local_today(zone)
    rows = database.list_task_calendar(start.isoformat(), end.isoformat())
    split = split_task_calendar(rows, start=start, end=end, today=today)
    return TaskCalendarResponse(
        timezone=zone,
        today=today,
        tasks=[_calendar_task(row, today, review=False) for row in split["tasks"]],
        undated=[_calendar_task(row, today, review=False) for row in split["undated"]],
        needs_date_review=[_calendar_task(row, today, review=True) for row in split["needs_date_review"]],
    )


@app.get("/api/items/{item_id}/google-calendar", response_model=GoogleCalendarLink)
def google_calendar_link(
    item_id: str,
    end_time: str | None = None,
    end_date: date | None = None,
) -> GoogleCalendarLink:
    """Return a prefilled Google Calendar URL. Opening it does not save the event."""
    item = database.get_item(item_id)
    if item is None:
        raise ApiError(404, "not_found", "That item could not be found.")
    if item.get("review_status") != "confirmed":
        raise ApiError(400, "needs_confirmation", "Confirm this item before opening Google Calendar.")
    event = item.get("event")
    if not event:
        raise ApiError(
            400,
            "needs_event_date",
            "Add a real event date before opening Google Calendar. An unclear date is not enough.",
        )
    stored_end_time = event.get("end_time")
    stored_end = stored_date(event.get("end_date"))
    # A caller-supplied end is only a confirmation for this link. It is not saved.
    chosen_end_time = stored_end_time or (checked_time(end_time) if end_time else None)
    chosen_end_date = stored_end if stored_end_time else (stored_end or end_date)
    try:
        url = google_calendar_url(
            title=item.get("title") or "",
            event_date=stored_date(event.get("event_date")),
            start_time=event.get("start_time"),
            end_date=chosen_end_date,
            end_time=chosen_end_time,
            timezone_name=event.get("timezone"),
            location=event.get("location"),
            meeting_url=event.get("meeting_url"),
            summary=item.get("summary"),
            category=item.get("category"),
            default_timezone=DEFAULT_TIMEZONE,
        )
    except GoogleCalendarError as exc:
        raise ApiError(400, exc.code, exc.message) from exc
    return GoogleCalendarLink(url=url)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
