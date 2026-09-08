import sqlite3
import hashlib
import os
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = os.urandom(24)
DB = "events.db"

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
            created_by INTEGER NOT NULL,
            FOREIGN KEY(created_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            event_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(event_id) REFERENCES events(id)
        );
    """)
    if not db.execute("SELECT id FROM users WHERE role='admin'").fetchone():
        db.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                   ("admin", hashlib.sha256(b"admin123").hexdigest(), "admin"))
    db.commit()
    db.close()

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

@app.route("/")
def index():
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), "index.html")

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    pw_hash = hashlib.sha256(data["password"].encode()).hexdigest()
    db = get_db()
    try:
        db.execute("INSERT INTO users (username, password) VALUES (?, ?)", (data["username"], pw_hash))
        db.commit()
    except sqlite3.IntegrityError:
        db.close()
        return jsonify({"error": "username taken"}), 400
    db.close()
    return jsonify({"ok": True})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    pw_hash = hashlib.sha256(data["password"].encode()).hexdigest()
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username=? AND password=?", (data["username"], pw_hash)).fetchone()
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
@login_required
def me():
    return jsonify({"id": session["user_id"], "username": session["username"], "role": session["role"]})

@app.route("/api/events")
def list_events():
    db = get_db()
    events = db.execute("SELECT e.*, u.username as creator FROM events e JOIN users u ON e.created_by=u.id ORDER BY date ASC").fetchall()
    db.close()
    return jsonify([dict(e) for e in events])

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
    d = request.json
    db = get_db()
    db.execute("INSERT INTO events (title, description, date, location, price, tickets, created_by) VALUES (?,?,?,?,?,?,?)",
               (d["title"], d["description"], d["date"], d["location"], d["price"], d["tickets"], session["user_id"]))
    db.commit()
    db.close()
    return jsonify({"ok": True})

@app.route("/api/events/<int:eid>", methods=["PUT"])
@admin_required
def update_event(eid):
    d = request.json
    db = get_db()
    db.execute("UPDATE events SET title=?, description=?, date=?, location=?, price=?, tickets=? WHERE id=?",
               (d["title"], d["description"], d["date"], d["location"], d["price"], d["tickets"], eid))
    db.commit()
    db.close()
    return jsonify({"ok": True})

@app.route("/api/events/<int:eid>", methods=["DELETE"])
@admin_required
def delete_event(eid):
    db = get_db()
    db.execute("DELETE FROM bookings WHERE event_id=?", (eid,))
    db.execute("DELETE FROM events WHERE id=?", (eid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})

@app.route("/api/book", methods=["POST"])
@login_required
def book():
    d = request.json
    db = get_db()
    event = db.execute("SELECT tickets FROM events WHERE id=?", (d["event_id"],)).fetchone()
    if not event or event["tickets"] < d["quantity"]:
        db.close()
        return jsonify({"error": "not enough tickets"}), 400
    db.execute("INSERT INTO bookings (user_id, event_id, quantity) VALUES (?,?,?)",
               (session["user_id"], d["event_id"], d["quantity"]))
    db.execute("UPDATE events SET tickets=tickets-? WHERE id=?", (d["quantity"], d["event_id"]))
    db.commit()
    db.close()
    return jsonify({"ok": True})

@app.route("/api/bookings")
@login_required
def my_bookings():
    db = get_db()
    bookings = db.execute("SELECT b.*, e.title, e.date, e.location, e.price FROM bookings b JOIN events e ON b.event_id=e.id WHERE b.user_id=?",
                          (session["user_id"],)).fetchall()
    db.close()
    return jsonify([dict(b) for b in bookings])

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", debug=False, port=9000)
