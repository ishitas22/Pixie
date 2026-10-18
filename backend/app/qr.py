"""Decode QR codes on this computer. Payloads are never sent to a cloud API."""

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

logger = logging.getLogger("pixie.qr")

UNREADABLE_NOTE = (
    "A QR code was found but could not be read. Try a clearer image, or enter the link yourself."
)

_REGISTER = re.compile(r"\b(?:register|registration|rsvp|sign[\s-]?up)\b", re.IGNORECASE)
_APPLY = re.compile(r"\b(?:apply|application)\b", re.IGNORECASE)
_ACTION = re.compile(
    r"\b(?:register|registration|rsvp|sign[\s-]?up|apply|application|submit|enroll)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class QrCode:
    payload: str
    readable: bool


def is_http_url(payload: str) -> bool:
    """True only for an exact http or https URL. Other text is not rewritten into one."""
    if not payload or any(character.isspace() for character in payload):
        return False
    try:
        parts = urlsplit(payload)
    except ValueError:
        return False
    return parts.scheme in {"http", "https"} and bool(parts.hostname)


def mailto_address(payload: str) -> str | None:
    """Address inside an exact mailto payload. The payload itself is not rewritten."""
    if not payload or any(character.isspace() for character in payload):
        return None
    prefix, separator, rest = payload.partition(":")
    if separator != ":" or prefix.lower() != "mailto" or not rest:
        return None
    address = rest.split("?", 1)[0]
    if not address or "@" not in address:
        return None
    return address


def is_mailto(payload: str) -> bool:
    return mailto_address(payload) is not None


def is_clickable_link(payload: str) -> bool:
    """Http(s) and mailto payloads can be opened. Other text stays text."""
    return is_http_url(payload) or is_mailto(payload)


def display_domain(payload: str) -> str | None:
    if not is_http_url(payload):
        return None
    return urlsplit(payload).hostname


def link_label(payload: str) -> str | None:
    """Hostname for a web link, or the address for a mailto link."""
    if is_http_url(payload):
        return display_domain(payload)
    return mailto_address(payload)


def exact_http_payload(candidate: object, payloads: list[str]) -> str | None:
    """Return the stored payload only when the candidate matches it exactly."""
    if not isinstance(candidate, str):
        return None
    wanted = candidate.strip()
    for payload in payloads:
        if payload == wanted and is_http_url(payload):
            return payload
    return None


def dedupe_codes(codes: list[QrCode]) -> list[QrCode]:
    seen: set[str] = set()
    result: list[QrCode] = []
    unreadable = False
    for code in codes:
        if not code.readable or not code.payload:
            if not unreadable:
                result.append(QrCode(payload="", readable=False))
                unreadable = True
            continue
        if code.payload in seen:
            continue
        seen.add(code.payload)
        result.append(code)
    return result


def _readings(decoded: object, points: object) -> list[QrCode]:
    if isinstance(decoded, str):
        values = [decoded]
    elif decoded is None:
        values = []
    else:
        values = [value if isinstance(value, str) else "" for value in decoded]
    codes: list[QrCode] = []
    for value in values:
        if value:
            codes.append(QrCode(payload=value, readable=True))
        elif points is not None:
            codes.append(QrCode(payload="", readable=False))
    return codes


def _payloads(codes: list[QrCode]) -> list[QrCode]:
    return [code for code in codes if code.readable and code.payload]


def _quads(points: object) -> list:
    import numpy as np

    if points is None:
        return []
    array = np.asarray(points, dtype=np.float32)
    if array.size == 0 or not np.isfinite(array).all():
        return []
    if array.ndim == 3 and array.shape[-2:] == (4, 2):
        return [quad for quad in array]
    if array.shape == (4, 2) or array.size == 8:
        return [array.reshape(4, 2)]
    return []


def _straighten(image, points) -> object:
    """Warp one detected quad into a square crop with a quiet zone."""
    import cv2
    import numpy as np

    quad = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    if quad.shape != (4, 2) or not np.isfinite(quad).all():
        return None
    sums = quad.sum(axis=1)
    diffs = np.diff(quad, axis=1).reshape(-1)
    ordered = np.array(
        [
            quad[np.argmin(sums)],
            quad[np.argmin(diffs)],
            quad[np.argmax(sums)],
            quad[np.argmax(diffs)],
        ],
        dtype=np.float32,
    )
    width = int(max(np.linalg.norm(ordered[0] - ordered[1]), np.linalg.norm(ordered[2] - ordered[3])))
    height = int(max(np.linalg.norm(ordered[1] - ordered[2]), np.linalg.norm(ordered[3] - ordered[0])))
    if width < 20 or height < 20:
        return None
    margin = max(8, int(round(0.12 * max(width, height))))
    destination = np.array(
        [
            [margin, margin],
            [margin + width - 1, margin],
            [margin + width - 1, margin + height - 1],
            [margin, margin + height - 1],
        ],
        dtype=np.float32,
    )
    try:
        matrix = cv2.getPerspectiveTransform(ordered, destination)
        return cv2.warpPerspective(
            image,
            matrix,
            (width + margin * 2, height + margin * 2),
            borderValue=255,
        )
    except cv2.error:
        return None


def _decode_crop(detector, crop) -> list[QrCode]:
    import cv2

    decoded, points, _straight = detector.detectAndDecode(crop)
    found = _payloads(_readings(decoded, points))
    if found:
        return found
    long_side = max(crop.shape[:2])
    if long_side < 80 or long_side >= 900:
        return []
    bigger = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    decoded, points, _straight = detector.detectAndDecode(bigger)
    return _payloads(_readings(decoded, points))


def _read_detector(detector, image, *, locate: bool) -> list[QrCode]:
    multi = detector.detectAndDecodeMulti(image)
    decoded = multi[1] if len(multi) > 1 else ()
    points = multi[2] if len(multi) > 2 else None
    found = _readings(decoded, points)
    if _payloads(found):
        return _payloads(found)
    single_decoded, single_points, _straight = detector.detectAndDecode(image)
    single = _readings(single_decoded, single_points)
    if _payloads(single):
        return _payloads(single)
    quads = _quads(points) or _quads(single_points)
    if locate and not quads:
        _ok, located = detector.detect(image)
        quads = _quads(located)
    for quad in quads:
        crop = _straighten(image, quad)
        if crop is None:
            continue
        recovered = _decode_crop(detector, crop)
        if recovered:
            return recovered
    if any(not code.readable for code in found):
        return found
    if any(not code.readable for code in single):
        return single
    return []


def _candidate_views(bgr):
    """Original pixels first, then contrast and a cubic upscale for a hard photo."""
    import cv2

    yield bgr
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    yield gray
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    yield clahe
    height, width = gray.shape[:2]
    if max(height, width) < 1600:
        enlarged = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        yield enlarged
        yield cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(enlarged)
    blurred = cv2.GaussianBlur(gray, (0, 0), 1.0)
    yield cv2.addWeighted(gray, 1.6, blurred, -0.6, 0)


def scan_image(path: Path) -> list[QrCode]:
    """Scan one image with OpenCV. A detector failure returns no codes and does not raise."""
    try:
        import cv2
        import numpy as np
        from PIL import Image, ImageOps

        with Image.open(path) as opened:
            oriented = ImageOps.exif_transpose(opened) or opened
            rgb = np.array(oriented.convert("RGB"))
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        detector = cv2.QRCodeDetector()
        saw_unreadable = False
        for index, view in enumerate(_candidate_views(bgr)):
            codes = _read_detector(detector, view, locate=index == 0)
            readable = _payloads(codes)
            if readable:
                return dedupe_codes(readable)
            if any(not code.readable for code in codes):
                saw_unreadable = True
        if saw_unreadable:
            return [QrCode(payload="", readable=False)]
        return []
    except Exception:
        logger.exception("QR scan failed")
        return []


def http_payloads(payloads: list[str]) -> list[str]:
    found: list[str] = []
    for payload in payloads:
        if is_http_url(payload) and payload not in found:
            found.append(payload)
    return found


def associate_qr_links(items: list, payloads: list[str]) -> list:
    """Attach one exact URL when a single code clearly belongs to one action.

    Several codes stay unassigned so the person can choose. A lone code that is
    not tied to one action stays unlabeled here; the card calls it a link from
    the QR code.
    """
    urls = http_payloads(payloads)
    if len(urls) != 1:
        return items
    url = urls[0]
    hits: list[tuple[object, object, str]] = []
    for item in items:
        for task in item.tasks:
            blob = f"{task.title}\n{task.supporting_text}"
            if _ACTION.search(blob):
                hits.append((item, task, blob))
    if len(hits) != 1:
        return items
    item, task, blob = hits[0]
    task.link_url = url
    if _REGISTER.search(blob):
        task.link_label = "Registration link"
        if not item.registration_url:
            item.registration_url = url
    elif _APPLY.search(blob):
        task.link_label = "Application link"
    else:
        task.link_label = "Link from QR code."
    return items
