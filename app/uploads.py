"""
Event image uploads.

Validated by extension and magic bytes, then stored under static/uploads/
with a random name. No image library needed — files are served as static
assets and never executed, and MAX_CONTENT_LENGTH caps their size.
"""

import secrets
from pathlib import Path

from flask import current_app

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

# Leading bytes that identify each format. Guards against a renamed
# executable, which an extension check alone would let through.
MAGIC_NUMBERS = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpeg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
)

WEBP_PREFIX = b"RIFF"
WEBP_MARKER = b"WEBP"


def upload_dir() -> Path:
    """static/uploads/, created on first use."""
    target = Path(current_app.static_folder) / "uploads"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _looks_like_image(header: bytes) -> bool:
    """True when the leading bytes match a known image format."""
    if any(header.startswith(sig) for sig, _ in MAGIC_NUMBERS):
        return True
    return header.startswith(WEBP_PREFIX) and WEBP_MARKER in header[:16]


def save_image(file_storage) -> str:
    """
    Persist an uploaded image and return its public URL.

    Raises ValueError with a user-facing message when the file is missing,
    the wrong type, or does not look like a real image.
    """
    if file_storage is None or not file_storage.filename:
        raise ValueError("No file was uploaded")

    extension = _extension(file_storage.filename)
    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValueError(f"Unsupported file type — use one of: {allowed}")

    header = file_storage.stream.read(32)
    file_storage.stream.seek(0)

    if not _looks_like_image(header):
        raise ValueError("That file is not a valid image")

    name = f"{secrets.token_hex(12)}.{extension}"
    file_storage.save(upload_dir() / name)
    return f"/static/uploads/{name}"
