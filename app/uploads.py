# image uploads. ext + magic bytes, random filename, served as static.
# MAX_CONTENT_LENGTH is what caps the size.

import secrets
from pathlib import Path

from flask import current_app

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

# magic bytes. catches a renamed exe that an extension check alone would wave through.
MAGIC_NUMBERS = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpeg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
)

WEBP_PREFIX = b"RIFF"
WEBP_MARKER = b"WEBP"


def upload_dir() -> Path:
    # static/uploads, made on first use
    target = Path(current_app.static_folder) / "uploads"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _looks_like_image(header: bytes) -> bool:
    # do the first bytes look like a real image
    if any(header.startswith(sig) for sig, _ in MAGIC_NUMBERS):
        return True
    return header.startswith(WEBP_PREFIX) and WEBP_MARKER in header[:16]


def save_image(file_storage) -> str:
    # save it, return the public url.
    # ValueError message is safe to show the user as-is.
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
