"""
Authentication helpers: password hashing and the route decorators that
guard logged-in / admin-only endpoints.
"""

import hashlib
from functools import wraps

from flask import current_app, jsonify, session, request


def hash_password(password: str) -> str:
    """Salted SHA-256. Not bcrypt, but keeps the demo dependency-free."""
    salt = current_app.config["PW_SALT"]
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()


def current_user() -> dict | None:
    """Session user as a dict, or None when logged out."""
    if "user_id" not in session:
        return None
    return {
        "id": session["user_id"],
        "username": session["username"],
        "role": session.get("role", "user"),
    }


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session or session.get("role") != "admin":
            return jsonify({"error": "forbidden"}), 403
        return fn(*args, **kwargs)
    return wrapper


def check_csrf() -> bool:
    """Validate the X-CSRF-Token header against the session token."""
    token = request.headers.get("X-CSRF-Token", "")
    return bool(token) and token == session.get("csrf")
