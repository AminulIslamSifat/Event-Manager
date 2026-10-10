# db layer: connection, schema, migrations, seed data.
# everything goes through get_db() so there's one place to change the strategy.

import sqlite3

from flask import current_app, g

from . import sync


def get_db() -> sqlite3.Connection:
    # request-scoped conn, opened on demand.
    # callers get a plain sqlite3.Connection. cloud mirroring is explicit --
    # write routes call sync.commit(db) instead of db.commit().
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exception=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


# schema

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role     TEXT DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS venues (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL UNIQUE,
    address  TEXT DEFAULT '',
    capacity INTEGER NOT NULL DEFAULT 0,
    fee      REAL    NOT NULL DEFAULT 0,
    notes    TEXT    DEFAULT '',
    active   INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artists (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL UNIQUE,
    genre    TEXT DEFAULT '',
    fee      REAL NOT NULL DEFAULT 0,
    active   INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    date        TEXT NOT NULL,
    location    TEXT NOT NULL,
    price       REAL NOT NULL DEFAULT 0,
    tickets     INTEGER NOT NULL DEFAULT 0,
    category    TEXT DEFAULT 'General',
    image_url   TEXT DEFAULT '',
    created_by  INTEGER NOT NULL,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    event_id    INTEGER NOT NULL,
    quantity    INTEGER NOT NULL,
    booked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status      TEXT DEFAULT 'pending_payment',
    payment_method TEXT DEFAULT '',
    transaction_id TEXT DEFAULT '',
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(event_id) REFERENCES events(id)
);

-- ===== event production tables =====

CREATE TABLE IF NOT EXISTS event_artists (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id  INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    fee       REAL NOT NULL DEFAULT 0,   -- snapshot of artist fee at booking time
    FOREIGN KEY(event_id)  REFERENCES events(id)  ON DELETE CASCADE,
    FOREIGN KEY(artist_id) REFERENCES artists(id)
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name     TEXT NOT NULL,
    price    REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0,
    sold     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

# columns added to events after the first release.
#
# sqlite won't take a non-constant default (CURRENT_TIMESTAMP) in ALTER TABLE,
# so created_at goes in bare and gets backfilled after.
EVENT_MIGRATIONS = [
    ("venue_id",            "INTEGER"),
    ("venue_name",          "TEXT DEFAULT ''"),
    ("venue_fee",           "REAL DEFAULT 0"),
    ("venue_capacity",      "INTEGER DEFAULT 0"),
    ("artists_total",       "REAL DEFAULT 0"),
    ("organizer_costs",     "REAL DEFAULT 0"),
    ("admin_margin",        "REAL DEFAULT 0"),
    ("sponsorship",         "REAL DEFAULT 0"),
    ("has_smoke_detector",  "INTEGER DEFAULT 0"),
    ("has_drug_detector",   "INTEGER DEFAULT 0"),
    ("security_notes",      "TEXT DEFAULT ''"),
    ("status",              "TEXT DEFAULT 'published'"),
    ("platform_fee_paid",   "INTEGER DEFAULT 0"),
    ("created_at",          "TIMESTAMP"),
]

BOOKING_MIGRATIONS = [
    ("tier_id",   "INTEGER"),
    ("tier_name", "TEXT DEFAULT ''"),
]

# profile fields from signup, editable later.
# created_at bare + backfilled, same sqlite restriction as events.
USER_MIGRATIONS = [
    ("full_name",  "TEXT DEFAULT ''"),
    ("email",      "TEXT DEFAULT ''"),
    ("phone",      "TEXT DEFAULT ''"),
    ("city",       "TEXT DEFAULT ''"),
    ("bio",        "TEXT DEFAULT ''"),
    ("created_at", "TIMESTAMP"),
]


def _table_exists(db, table: str) -> bool:
    row = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def _add_missing_columns(db, table: str, columns: list[tuple[str, str]]) -> None:
    # adds whatever columns are missing, safe to re-run
    if not _table_exists(db, table):
        return
    existing = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    for name, ddl in columns:
        if name not in existing:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def _backfill_timestamp(db, table: str, column: str = "created_at") -> None:
    # old rows predate the column, give em something
    if not _table_exists(db, table):
        return
    columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        return
    db.execute(f"UPDATE {table} SET {column} = CURRENT_TIMESTAMP WHERE {column} IS NULL")


def init_db() -> None:
    # create + migrate. safe to run every boot.
    db = get_db()
    db.executescript(SCHEMA)
    _add_missing_columns(db, "events", EVENT_MIGRATIONS)
    _add_missing_columns(db, "bookings", BOOKING_MIGRATIONS)
    _add_missing_columns(db, "users", USER_MIGRATIONS)
    _backfill_timestamp(db, "events")
    _backfill_timestamp(db, "users")

    # make sure there's an admin
    from .auth import hash_password
    if not db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        db.execute(
            "INSERT INTO users (username, password, role) VALUES (?,?,?)",
            ("admin", hash_password("admin123"), "admin"),
        )

    # defaults
    db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('platform_fee', ?)",
               (str(current_app.config["PLATFORM_FEE"]),))
    sync.commit(db)


# reference data. seeded once, admins edit it after that.

# (name, address, capacity, fee)
VENUES = [
    ("Bangladesh Army Stadium",
     "Dhaka Cantonment, Dhaka 1206", 20_000, 200_000),
    ("Sher-e-Bangla National Stadium",
     "Mirpur, Dhaka 1216", 30_000, 250_000),
    ("ICCB Expo Zone",
     "Bashundhara City, Panthapath, Dhaka 1215", 15_000, 100_000),
    ("ICCB Hall",
     "Bashundhara City, Panthapath, Dhaka 1215", 5_000, 20_000),
    ("Bangladesh-China Friendship Conference Center",
     "Agargaon, Sher-e-Bangla Nagar, Dhaka 1207", 10_000, 100_000),
    ("Ward No. 10 Community Center, Mirpur",
     "Mirpur, Dhaka 1216", 5_000, 30_000),
    ("Senakunja",
     "Dhaka Cantonment, Dhaka 1206", 10_000, 100_000),
    ("Pan Pacific Sonargaon",
     "107 Kazi Nazrul Islam Ave, Karwan Bazar, Dhaka 1215", 10_000, 100_000),
]

ARTISTS = [
    ("Nagarbaul James",    2_000_000), ("Miles",        500_000),
    ("Warfaze",              500_000), ("Arbovirus",     400_000),
    ("ARK",                  400_000), ("Shironamhin",   400_000),
    ("Cryptic Fate",         200_000), ("Aurthohin",     150_000),
    ("Sonar Bangla Circus",  100_000), ("AVASH",         100_000),
    ("Karnival",             100_000), ("Habib Wahid",   100_000),
    ("Tahsan",               100_000), ("Black",         100_000),
    ("Bay of Bengal",         80_000), ("Pritam",         80_000),
    ("Indalo",                80_000), ("Power Surge",    80_000),
    ("Lalon",                 80_000), ("Popeye Bangladesh", 70_000),
    ("Kaktaal",               50_000), ("Arnob",          50_000),
    ("Mizan and Brothers",    50_000), ("Oni Hasan",      50_000),
    ("Jalali Set",            40_000), ("Encore",         40_000),
    ("Vikings",               40_000), ("Ashes",          30_000),
    ("Noble Man",             20_000), ("Masha Islam",    20_000),
    ("Sunidhi Nayak",         20_000), ("AK Rahul",       10_000),
]


def seed_reference_data() -> None:
    # only seeds when the table is empty, so it never clobbers edits
    db = get_db()

    if not db.execute("SELECT 1 FROM venues LIMIT 1").fetchone():
        db.executemany(
            "INSERT INTO venues (name, address, capacity, fee) VALUES (?,?,?,?)",
            VENUES,
        )

    if not db.execute("SELECT 1 FROM artists LIMIT 1").fetchone():
        db.executemany(
            "INSERT INTO artists (name, fee) VALUES (?,?)",
            ARTISTS,
        )

    sync.commit(db)
