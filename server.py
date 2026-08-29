import sqlite3
import hashlib
import os
import secrets
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
DB = "events.db"
PER_PAGE = 12

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            date TEXT NOT NULL,
            location TEXT NOT NULL,
            price REAL NOT NULL,
            tickets INTEGER NOT NULL,
            category TEXT DEFAULT 'General',
            image_url TEXT DEFAULT '',
            created_by INTEGER NOT NULL,
            FOREIGN KEY(created_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            event_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending_payment',
            payment_method TEXT DEFAULT '',
            transaction_id TEXT DEFAULT '',
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(event_id) REFERENCES events(id)
        );
    """)
    # Migrate existing DBs
    for col, ddl in [("category", "ALTER TABLE events ADD COLUMN category TEXT DEFAULT 'General'"),
                     ("image_url", "ALTER TABLE events ADD COLUMN image_url TEXT DEFAULT ''"),
                     ("booked_at", "ALTER TABLE bookings ADD COLUMN booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
                     ("status", "ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT 'confirmed'"),
                     ("payment_method", "ALTER TABLE bookings ADD COLUMN payment_method TEXT DEFAULT ''"),
                     ("transaction_id", "ALTER TABLE bookings ADD COLUMN transaction_id TEXT DEFAULT ''")]:
        try:
            db.execute(ddl)
        except sqlite3.OperationalError:
            pass
    if not db.execute("SELECT id FROM users WHERE role='admin'").fetchone():
        db.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                   ("admin", hash_pw("admin123"), "admin"))
    db.commit()
    db.close()

def hash_pw(pw: str) -> str:
    salt = os.environ.get("PW_SALT", "eventkhujo_salt_2026")
    print(hashlib.sha256(f"{salt}:{pw}".encode()).hexdigest())
    return hashlib.sha256(f"{salt}:{pw}".encode()).hexdigest()

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper

def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session or session.get("role") != "admin":
            return jsonify({"error": "forbidden"}), 403
        return f(*args, **kwargs)
    return wrapper

def validate_event(d: dict) -> str | None:
    if not d.get("title", "").strip():
        return "title is required"
    if not d.get("description", "").strip():
        return "description is required"
    if not d.get("date"):
        return "date is required"
    if not d.get("location", "").strip():
        return "location is required"
    try:
        price = float(d.get("price", 0))
        tickets = int(d.get("tickets", 0))
    except (ValueError, TypeError):
        return "price and tickets must be numbers"
    if price < 0:
        return "price cannot be negative"
    if tickets < 1:
        return "must have at least 1 ticket"
    return None

@app.route("/")
def index():
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), "index.html")

@app.route("/api/csrf")
def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return jsonify({"token": session["csrf"]})

def check_csrf() -> bool:
    token = request.headers.get("X-CSRF-Token", "")
    return token and token == session.get("csrf")

@app.route("/api/register", methods=["POST"])
def register():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403
    data = request.json or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if len(username) < 3:
        return jsonify({"error": "username must be at least 3 characters"}), 400
    if len(password) < 4:
        return jsonify({"error": "password must be at least 4 characters"}), 400
    db = get_db()
    try:
        db.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, hash_pw(password)))
        db.commit()
    except sqlite3.IntegrityError:
        db.close()
        return jsonify({"error": "username taken"}), 400
