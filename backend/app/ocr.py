"""Extract text from a screenshot with the local Tesseract install."""

import re
import shutil
from pathlib import Path

import pytesseract
from PIL import Image, ImageOps

WINDOWS_TESSERACT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")


class OcrEngineError(Exception):
    """Tesseract could not be run. The message is safe to show to the user."""


def configure_tesseract() -> str | None:
    discovered = shutil.which("tesseract")
    if discovered:
        pytesseract.pytesseract.tesseract_cmd = discovered
        return discovered
    if WINDOWS_TESSERACT.is_file():
        pytesseract.pytesseract.tesseract_cmd = str(WINDOWS_TESSERACT)
        return str(WINDOWS_TESSERACT)
    return None


def check_tesseract() -> tuple[bool, str]:
    executable = configure_tesseract()
    if not executable:
        return False, "Tesseract is not installed or not on PATH."
    try:
        version = pytesseract.get_tesseract_version()
    except Exception:
        return False, "Tesseract is installed but could not be started."
    return True, f"Tesseract {version} is ready."


def has_readable_text(text: str) -> bool:
    return re.search(r"[A-Za-z0-9]{2,}", text) is not None


def clean_ocr(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\x0c", "").splitlines()]
    collapsed: list[str] = []
    blank = False
    for line in lines:
        if line.strip() == "":
            if not blank:
                collapsed.append("")
            blank = True
            continue
        collapsed.append(line)
        blank = False
    return "\n".join(collapsed).strip()


def prepare_image(image: Image.Image) -> Image.Image:
    oriented = ImageOps.exif_transpose(image) or image
    prepared = oriented.convert("RGB")
    if prepared.width < 1200:
        prepared = prepared.resize(
            (prepared.width * 2, prepared.height * 2),
            Image.Resampling.LANCZOS,
        )
    return prepared


def extract_text(image_path: Path) -> str:
    if not configure_tesseract():
        raise OcrEngineError("Tesseract is not installed or not on PATH.")
    try:
        with Image.open(image_path) as image:
            prepared = prepare_image(image)
            prepared.load()
    except Exception as exc:
        raise OcrEngineError("Tesseract could not open this screenshot.") from exc

    last_error: Exception | None = None
    best = ""
    for page_mode in (6, 11):
        try:
            raw = pytesseract.image_to_string(
                prepared,
                lang="eng",
                config=f"--oem 3 --psm {page_mode}",
            )
        except pytesseract.TesseractNotFoundError as exc:
            raise OcrEngineError("Tesseract is not installed or not on PATH.") from exc
        except Exception as exc:
            last_error = exc
            continue
        text = clean_ocr(raw)
        if has_readable_text(text):
            return text
        if len(text) > len(best):
            best = text
    if last_error and not best:
        raise OcrEngineError("Tesseract could not read this screenshot.") from last_error
    return best
