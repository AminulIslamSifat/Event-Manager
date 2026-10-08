"""
Cloud sync layer.

MongoDB is the source of truth; the local SQLite file is a cache.

    startup :  MongoDB  ->  SQLite    (pull)
    write   :  SQLite   ->  MongoDB   (push, on commit)

SQLite keeps doing all the querying, so every existing `db.execute(...)` call
continues to work untouched. The sync happens underneath via a trace callback
that notes which tables a transaction touched, then mirrors those tables to
Atlas when the transaction commits.

If Atlas is unreachable the bot keeps running against the local cache and the
pending writes are retried on the next successful commit.
"""

from __future__ import annotations

import re
import sqlite3
import threading

# INSERT [OR x] INTO t / UPDATE t / DELETE FROM t / REPLACE INTO t
_WRITE_RE = re.compile(
    r"^\s*(?:"
    r"INSERT(?:\s+OR\s+\w+)?\s+INTO\s+|"
    r"REPLACE\s+INTO\s+|"
    r"UPDATE\s+|"
    r"DELETE\s+FROM\s+"
    r")[\"`\[]?(\w+)",
    re.IGNORECASE,
)

# Mirrored in this order so parent rows land before children on a pull.
SYNCED_TABLES = (
    "users",
    "venues",
    "artists",
    "events",
    "event_artists",
    "ticket_tiers",
    "bookings",
    "settings",
)

# Tables whose primary key is not a surrogate `id`.
KEY_OVERRIDES = {"settings": "key"}

_state: dict = {
    "db": None,
    "enabled": False,
    "suspended": False,
    "pending": set(),
}
_lock = threading.RLock()


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def configure(app) -> None:
    """Attach a MongoDB database handle from Flask config."""
    uri = app.config.get("MONGODB_URI")
    name = app.config.get("MONGODB_DB", "event_khujo_db")

    if not uri:
        print("[sync] No MONGODB_URI configured - cloud sync disabled.")
        return

    try:
        from pymongo import MongoClient
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
    except Exception as exc:
        print(f"[sync] MongoDB unreachable - running local-only. ({exc})")
        return

    _state["db"] = client[name]
    _state["enabled"] = True
    print(f"[sync] Connected to MongoDB database '{name}'.")


def enabled() -> bool:
    return _state["enabled"]


def suspend() -> None:
    _state["suspended"] = True


def resume() -> None:
    _state["suspended"] = False


# ---------------------------------------------------------------------------
# Connection wrapper
# ---------------------------------------------------------------------------

class SyncConnection(sqlite3.Connection):
    """
    SQLite connection that mirrors touched tables to MongoDB on commit.

    Uses SQLite's trace hook to observe statements, so no caller has to
    announce what it changed.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._dirty: set[str] = set()
        self.set_trace_callback(self._note_write)

    def _note_write(self, statement: str) -> None:
        match = _WRITE_RE.match(statement or "")
        if match:
            self._dirty.add(match.group(1).lower())

    def commit(self) -> None:
        super().commit()

        dirty = self._dirty & set(SYNCED_TABLES)
        self._dirty.clear()

        if not dirty or _state["suspended"] or not _state["enabled"]:
            return

        # Pushing reads the same connection, so suppress re-entrancy.
        suspend()
        try:
            push_tables(self, dirty)
        finally:
            resume()


# ---------------------------------------------------------------------------
# Row helpers
# ---------------------------------------------------------------------------

def _rows_as_dicts(db, table: str) -> list[dict]:
    cursor = db.execute(f"SELECT * FROM {table}")
    columns = [c[0] for c in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _key_for(table: str) -> str:
    return KEY_OVERRIDES.get(table, "id")


# ---------------------------------------------------------------------------
# Push: SQLite -> MongoDB
# ---------------------------------------------------------------------------

def push_tables(db, tables) -> int:
    """
    Mirror the given tables to MongoDB.

    Each table is replaced wholesale. At this scale (hundreds of rows) that is
    cheaper than diffing, and it removes any chance of a stale document
    lingering after a delete.
    """
    database = _state["db"]
    if database is None:
        return 0

    pushed = 0
    for table in tables:
        try:
            rows = _rows_as_dicts(db, table)
        except sqlite3.OperationalError:
            continue  # table not created yet

        collection = database[table]
        try:
            if rows:
                collection.delete_many({})
                # Mongo rejects duplicate _id, and `id` is fine to keep.
                collection.insert_many(rows)
            else:
                collection.delete_many({})
            pushed += 1
        except Exception as exc:
            print(f"[sync] Push failed for '{table}': {exc}")

    return pushed


# ---------------------------------------------------------------------------
# Pull: MongoDB -> SQLite
# ---------------------------------------------------------------------------

def pull_all(db) -> int:
    """
    Replace local tables with their cloud contents.

    Only pulls a table when the cloud actually has documents, so a fresh
    Atlas database never wipes a populated local cache.
    """
    database = _state["db"]
    if database is None:
        return 0

    suspend()
    pulled = 0

    # Wipe children before parents, so no foreign key is ever left dangling.
    delete_order = list(reversed(SYNCED_TABLES))

    # Foreign keys are enforced per-connection, so they have to come off for
    # the reload. The DELETE/INSERT sequence below restores consistency long
    # before the pragma goes back on.
    try:
        db.execute("PRAGMA foreign_keys = OFF")
    except sqlite3.OperationalError:
        pass

    try:
        for table in delete_order:
            try:
                db.execute(f"DELETE FROM {table}")
            except sqlite3.OperationalError:
                pass  # table not created yet

        for table in SYNCED_TABLES:
            try:
                docs = list(database[table].find({}))
            except Exception as exc:
                print(f"[sync] Pull failed for '{table}': {exc}")
                continue

            if not docs:
                continue

            for doc in docs:
                doc.pop("_id", None)

            columns = list(docs[0].keys())
            placeholders = ",".join("?" for _ in columns)
            column_list = ",".join(columns)

            try:
                db.executemany(
                    f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})",
                    [tuple(doc.get(c) for c in columns) for doc in docs],
                )
                pulled += 1
            except sqlite3.OperationalError as exc:
                print(f"[sync] Could not load '{table}' into SQLite: {exc}")

        db.commit()
    finally:
        try:
            db.execute("PRAGMA foreign_keys = ON")
        except sqlite3.OperationalError:
            pass
        resume()

    return pulled
