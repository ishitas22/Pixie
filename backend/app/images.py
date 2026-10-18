"""Validate uploaded screenshots before they are stored."""

import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.config import MAX_IMAGE_BYTES

register_heif_opener()
Image.MAX_IMAGE_PIXELS = 40_000_000

_HEIF_BRANDS = frozenset(
    {
        b"heic",
        b"heix",
        b"hevc",
        b"hevx",
        b"heim",
        b"heis",
        b"hevm",
        b"hevs",
        b"heif",
        b"mif1",
        b"msf1",
    }
)
_HEIF_MIMES = frozenset(
    {
        "image/heic",
        "image/heif",
        "image/heic-sequence",
        "image/heif-sequence",
    }
)
_OCTET_MIMES = frozenset({"", "application/octet-stream", "binary/octet-stream"})
CHOOSE_IMAGE = "Choose a PNG, JPEG, or HEIC screenshot."
INVALID_IMAGE = "That file is not a valid PNG, JPEG, or HEIC."


class ImageRejected(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ValidImage:
    data: bytes
    extension: str
    media_type: str


def safe_filename(name: str, extension: str) -> str:
    base = Path(name).name
    base = re.sub(r"[^A-Za-z0-9._ -]", "", base).strip(" .")
    if not base or base.startswith("."):
        return f"screenshot{extension}"
    if not base.lower().endswith(extension):
        stem = Path(base).stem or "screenshot"
        base = f"{stem}{extension}"
    return base[:120]


def display_filename(name: str, stored_extension: str) -> str:
    """Sanitized original name. HEIC and HEIF uploads keep that suffix."""
    base = Path(name or "").name
    base = re.sub(r"[^A-Za-z0-9._ -]", "", base).strip(" .")
    suffix = Path(base).suffix.lower()
    if suffix in {".heic", ".heif"}:
        if not base or base.startswith("."):
            return f"screenshot{suffix}"
        return base[:120]
    return safe_filename(name or "screenshot", stored_extension)


def heif_major_brand(data: bytes) -> bytes | None:
    """Return the ISO-BMFF brand when the bytes look like HEIC or HEIF."""
    if len(data) < 12 or data[4:8] != b"ftyp":
        return None
    brand = data[8:12]
    if brand in _HEIF_BRANDS:
        return brand
    return None


def claims_heif(filename: str, content_type: str) -> bool:
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime in _HEIF_MIMES:
        return True
    suffix = Path(filename or "").suffix.lower()
    return suffix in {".heic", ".heif"} and mime in _OCTET_MIMES


def _convert_heif_to_jpeg(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data)) as image:
            image.load()
            if image.width < 1 or image.height < 1:
                raise ImageRejected("invalid_image", INVALID_IMAGE)
            frame = image.convert("RGB")
            buffer = BytesIO()
            frame.save(buffer, format="JPEG", quality=90)
            converted = buffer.getvalue()
    except ImageRejected:
        raise
    except Image.DecompressionBombError as exc:
        raise ImageRejected("invalid_image", "That image is too large to process.") from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageRejected("invalid_image", INVALID_IMAGE) from exc
    if not converted.startswith(b"\xff\xd8\xff"):
        raise ImageRejected("invalid_image", INVALID_IMAGE)
    return converted


def validate_image(data: bytes, filename: str = "", content_type: str = "") -> ValidImage:
    if not data:
        raise ImageRejected("invalid_image", "That file is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ImageRejected("file_too_large", "That image is larger than 8 MB.")

    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        kind = "png"
    elif data.startswith(b"\xff\xd8\xff"):
        kind = "jpeg"
    elif heif_major_brand(data) is not None or claims_heif(filename, content_type):
        converted = _convert_heif_to_jpeg(data)
        return ValidImage(data=converted, extension=".jpg", media_type="image/jpeg")
    else:
        raise ImageRejected("unsupported_type", CHOOSE_IMAGE)

    expected = "PNG" if kind == "png" else "JPEG"
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
        with Image.open(BytesIO(data)) as image:
            if image.format != expected:
                raise ImageRejected("invalid_image", INVALID_IMAGE)
            image.load()
            if image.width < 1 or image.height < 1:
                raise ImageRejected("invalid_image", INVALID_IMAGE)
    except ImageRejected:
        raise
    except Image.DecompressionBombError as exc:
        raise ImageRejected("invalid_image", "That image is too large to process.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageRejected("invalid_image", INVALID_IMAGE) from exc

    if kind == "png":
        return ValidImage(data=data, extension=".png", media_type="image/png")
    return ValidImage(data=data, extension=".jpg", media_type="image/jpeg")
