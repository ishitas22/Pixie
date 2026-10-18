"""Paths and local-only service settings."""

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
OLLAMA_HOST = "http://127.0.0.1:11434"
MODEL_NAME = "qwen2.5:3b"
DEFAULT_TIMEZONE = "America/New_York"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
# Expo web serves the app from port 8081 on this laptop.
FRONTEND_ORIGINS = (
    "http://localhost:8081",
    "http://127.0.0.1:8081",
)


def data_dir() -> Path:
    override = os.environ.get("PIXIE_DATA_DIR")
    if override:
        return Path(override)
    return BACKEND_ROOT / "data"


def image_dir() -> Path:
    return data_dir() / "images"


def database_path() -> Path:
    return data_dir() / "pixie.db"


def frontend_origins() -> list[str]:
    origins = list(FRONTEND_ORIGINS)
    extra = os.environ.get("PIXIE_FRONTEND_ORIGIN", "").strip()
    if extra and extra not in origins:
        origins.append(extra)
    return origins
