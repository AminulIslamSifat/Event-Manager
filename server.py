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
    db.close()
    return jsonify({"ok": True})

@app.route("/api/login", methods=["POST"])
def login():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403
    data = request.json or {}
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username=? AND password=?",
                      (data.get("username", "").strip(), hash_pw(data.get("password", "")))).fetchone()
    db.close()
    if not user:
        return jsonify({"error": "invalid credentials"}), 401
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["role"] = user["role"]
    return jsonify({"id": user["id"], "username": user["username"], "role": user["role"]})

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me")
def me():
    if "user_id" not in session:
        return jsonify({"logged_in": False})
    return jsonify({"logged_in": True, "id": session["user_id"], "username": session["username"], "role": session.get("role")})

@app.route("/api/events")
def list_events():
    db = get_db()
    q = request.args.get("q", "").strip()
    cat = request.args.get("category", "").strip()
    sort = request.args.get("sort", "date_asc")
    page = max(1, int(request.args.get("page", 1)))
    upcoming = request.args.get("upcoming", "0")

    where, params = [], []
    if q:
        where.append("(e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)")
        params.extend([f"%{q}%"] * 3)
    if cat and cat != "All":
        where.append("e.category = ?")
        params.append(cat)
    if upcoming == "1":
        where.append("e.date >= datetime('now')")

    sql_where = "WHERE " + " AND ".join(where) if where else ""
    order_map = {
        "date_asc": "e.date ASC",
        "date_desc": "e.date DESC",
        "price_asc": "e.price ASC",
        "price_desc": "e.price DESC",
    }
    order = order_map.get(sort, "e.date ASC")

    total = db.execute(f"SELECT COUNT(*) as c FROM events e {sql_where}", params).fetchone()["c"]
    offset = (page - 1) * PER_PAGE
    events = db.execute(
        f"SELECT e.*, u.username as creator FROM events e JOIN users u ON e.created_by=u.id {sql_where} ORDER BY {order} LIMIT ? OFFSET ?",
        params + [PER_PAGE, offset]
    ).fetchall()
    categories = [r["category"] for r in db.execute("SELECT DISTINCT category FROM events ORDER BY category").fetchall()]
    db.close()
    return jsonify({"events": [dict(e) for e in events], "total": total, "page": page, "pages": max(1, (total + PER_PAGE - 1) // PER_PAGE), "categories": categories})

@app.route("/api/events/<int:eid>")
def get_event(eid):
    db = get_db()
    event = db.execute("SELECT e.*, u.username as creator FROM events e JOIN users u ON e.created_by=u.id WHERE e.id=?", (eid,)).fetchone()
    db.close()
    if not event:
        return jsonify({"error": "not found"}), 404
    return jsonify(dict(event))

@app.route("/api/events", methods=["POST"])
@admin_required
def create_event():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403
    d = request.json or {}
    err = validate_event(d)
    if err:
        return jsonify({"error": err}), 400
    db = get_db()
    db.execute("INSERT INTO events (title,description,date,location,price,tickets,category,image_url,created_by) VALUES (?,?,?,?,?,?,?,?,?)",
               (d["title"].strip(), d["description"].strip(), d["date"], d["location"].strip(),
                float(d["price"]), int(d["tickets"]), d.get("category", "General").strip(), d.get("image_url", "").strip(), session["user_id"]))
    db.commit()
    db.close()
    return jsonify({"ok": True})

@app.route("/api/events/<int:eid>", methods=["PUT"])
@admin_required
def update_event(eid):
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403
    d = request.json or {}
    err = validate_event(d)
    if err:
        return jsonify({"error": err}), 400
    db = get_db()
    db.execute("UPDATE events SET title=?,description=?,date=?,location=?,price=?,tickets=?,category=?,image_url=? WHERE id=?",
               (d["title"].strip(), d["description"].strip(), d["date"], d["location"].strip(),
                float(d["price"]), int(d["tickets"]), d.get("category", "General").strip(), d.get("image_url", "").strip(), eid))
    db.commit()
    db.close()
    return jsonify({"ok": True})

@app.route("/api/events/<int:eid>", methods=["DELETE"])
@admin_required
def delete_event(eid):
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403
    db = get_db()
    db.execute("DELETE FROM bookings WHERE event_id=?", (eid,))
    db.execute("DELETE FROM events WHERE id=?", (eid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})

@app.route("/api/book", methods=["POST"])
@login_required
def book():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403
    d = request.json or {}
    qty = int(d.get("quantity", 0))
    event_id = int(d.get("event_id", 0))
    if qty < 1:
        return jsonify({"error": "quantity must be at least 1"}), 400
    db = get_db()
    # Atomic check-and-update prevents race condition
    row = db.execute("SELECT tickets, title, price FROM events WHERE id=?", (event_id,)).fetchone()
    if not row:
        db.close()
        return jsonify({"error": "event not found"}), 404
    if row["tickets"] < qty:
        db.close()
        return jsonify({"error": f"only {row['tickets']} tickets left"}), 400
