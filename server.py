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
