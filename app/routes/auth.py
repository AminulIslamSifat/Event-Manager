# auth routes: csrf, register, login, logout, profile

import re
import secrets
import sqlite3

from flask import Blueprint, jsonify, request, session

from ..auth import check_csrf, current_user, hash_password, login_required
from ..db import get_db

bp = Blueprint("auth", __name__, url_prefix="/api")

# deliberately loose: something@something.something
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@bp.get("/csrf")
def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return jsonify({"token": session["csrf"]})


# registration

def validate_signup(d: dict) -> str | None:
    # first error, or None if it's good
    username = (d.get("username") or "").strip()
    full_name = (d.get("full_name") or "").strip()
    email = (d.get("email") or "").strip()
    password = d.get("password") or ""
    confirm = d.get("confirm_password")

    if len(username) < 3:
        return "Username must be at least 3 characters"
    if not re.fullmatch(r"[A-Za-z0-9_]+", username):
        return "Username may only contain letters, numbers and underscores"
    if not full_name:
        return "Full name is required"
    if not EMAIL_RE.match(email):
        return "Enter a valid email address"
    if len(password) < 6:
        return "Password must be at least 6 characters"

    # confirm_password is optional so old clients keep working, but enforced if sent
    if confirm is not None and password != confirm:
        return "Passwords do not match"

    return None


@bp.post("/register")
def register():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    error = validate_signup(d)
    if error:
        return jsonify({"error": error}), 400

    username = d["username"].strip()
    email = d["email"].strip().lower()

    db = get_db()

    if db.execute("SELECT 1 FROM users WHERE LOWER(email)=?", (email,)).fetchone():
        return jsonify({"error": "An account with that email already exists"}), 400

    try:
        db.execute(
            """INSERT INTO users
                 (username, password, full_name, email, phone, city, bio, created_at)
               VALUES (?,?,?,?,?,?,?, CURRENT_TIMESTAMP)""",
            (
                username,
                hash_password(d["password"]),
                d["full_name"].strip(),
                email,
                (d.get("phone") or "").strip(),
                (d.get("city") or "").strip(),
                (d.get("bio") or "").strip(),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "That username is already taken"}), 400

    return jsonify({"ok": True})


# session

@bp.post("/login")
def login():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username=? AND password=?",
        (username, hash_password(password)),
    ).fetchone()

    if not user:
        return jsonify({"error": "Invalid username or password"}), 401

    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["role"] = user["role"]
    return jsonify(_public_user(user))


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    user = current_user()
    if not user:
        return jsonify({"logged_in": False})

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    if not row:
        session.clear()
        return jsonify({"logged_in": False})

    return jsonify({"logged_in": True, **_public_user(row)})


def _public_user(row) -> dict:
    # user row for the client. never includes the hash.
    keys = row.keys()

    def get(name):
        return row[name] if name in keys else ""

    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "full_name": get("full_name"),
        "email": get("email"),
        "phone": get("phone"),
        "city": get("city"),
        "bio": get("bio"),
        "created_at": get("created_at"),
    }


# profile

@bp.put("/profile")
@login_required
def update_profile():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    full_name = (d.get("full_name") or "").strip()
    email = (d.get("email") or "").strip().lower()

    if not full_name:
        return jsonify({"error": "Full name is required"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address"}), 400

    db = get_db()

    clash = db.execute(
        "SELECT 1 FROM users WHERE LOWER(email)=? AND id<>?", (email, session["user_id"])
    ).fetchone()
    if clash:
        return jsonify({"error": "That email is already in use"}), 400

    db.execute(
        """UPDATE users
              SET full_name=?, email=?, phone=?, city=?, bio=?
            WHERE id=?""",
        (
            full_name,
            email,
            (d.get("phone") or "").strip(),
            (d.get("city") or "").strip(),
            (d.get("bio") or "").strip(),
            session["user_id"],
        ),
    )
    db.commit()

    row = db.execute("SELECT * FROM users WHERE id=?", (session["user_id"],)).fetchone()
    return jsonify({"ok": True, "user": _public_user(row)})


@bp.post("/change-password")
@login_required
def change_password():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    old_password = d.get("old_password") or ""
    new_password = d.get("new_password") or ""
    confirm = d.get("confirm_password")

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400
    if confirm is not None and new_password != confirm:
        return jsonify({"error": "Passwords do not match"}), 400

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (session["user_id"],)).fetchone()
    if user["password"] != hash_password(old_password):
        return jsonify({"error": "Current password is incorrect"}), 401

    db.execute(
        "UPDATE users SET password=? WHERE id=?",
        (hash_password(new_password), session["user_id"]),
    )
    db.commit()
    return jsonify({"ok": True})
