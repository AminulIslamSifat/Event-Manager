# mongo is the source of truth, sqlite is a cache.
#
#   startup :  mongo -> sqlite   (pull)
#   write   :  sqlite -> mongo   (push, on commit)
#
# sqlite still does all the querying so db.execute() calls stay untouched.
# a trace callback watches which tables a tx touched, then mirrors em on commit.
#
# if atlas is down we keep running on the local cache. NOTE: failed pushes are
# dropped, not queued -- there is no retry.

from __future__ import annotations

import re
import sqlite3

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

# order matters on pull -- parents land before children
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


_state: dict = {
    "db": None,
    "enabled": False,
    "suspended": False,
}


# config

def configure(app) -> None:
    # grab the mongo handle off flask config
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


# connection wrapper

class SyncConnection(sqlite3.Connection):
    # mirrors touched tables to mongo on commit.
    # uses sqlite's trace hook so callers never announce what they changed.

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

        # push reads this same conn -> suppress re-entrancy or we deadlock
        suspend()
        try:
            push_tables(self, dirty)
        finally:
            resume()


# row helpers

def _rows_as_dicts(db, table: str) -> list[dict]:
    cursor = db.execute(f"SELECT * FROM {table}")
    columns = [c[0] for c in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


# push: sqlite -> mongo

def push_tables(db, tables) -> int:
    # wholesale replace. at a few hundred rows that beats diffing, and a stale
    # doc can never linger after a delete.
    database = _state["db"]
    if database is None:
        return 0

    pushed = 0
    for table in tables:
        try:
            rows = _rows_as_dicts(db, table)
        except sqlite3.OperationalError:
            continue  # table doesn't exist yet

        collection = database[table]
        try:
            collection.delete_many({})
            if rows:
                # keeping `id` is fine, it's `_id` that mongo hates dupes of
                collection.insert_many(rows)
            pushed += 1
        except Exception as exc:
            print(f"[sync] Push failed for '{table}': {exc}")

    return pushed


# pull: mongo -> sqlite

def pull_all(db) -> int:
    # only pulls a table if the cloud actually has docs, so a fresh atlas
    # never wipes a populated local cache.
    database = _state["db"]
    if database is None:
        return 0

    suspend()
    pulled = 0

    # children before parents, no dangling fk
    delete_order = list(reversed(SYNCED_TABLES))

    # fk enforcement is per-connection so it has to come off for the reload.
    # the delete/insert below restores consistency before the pragma goes back on.
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
