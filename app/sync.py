from __future__ import annotations

from pymongo import MongoClient, UpdateOne

# parents before children on a full push
SYNCED_TABLES = (
    "users", "venues", "artists", "events",
    "event_artists", "ticket_tiers", "bookings", "settings",
)

# sync key per table. everything is `id` except settings.
KEY = {"settings": "key"}

_mongo = None


def configure(app):
    global _mongo
    uri = app.config.get("MONGODB_URI")
    if not uri:
        print("[sync] no MONGODB_URI - cloud off")
        return
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        _mongo = client[app.config.get("MONGODB_DB", "event_khujo_db")]
        print("[sync] mongo connected")
    except Exception as exc:
        print(f"[sync] mongo down, local only ({exc})")


def enabled() -> bool:
    return _mongo is not None


def commit(db, *tables) -> None:
    # call instead of db.commit(). name the tables you touched:
    #   sync.commit(db, "events", "ticket_tiers")
    db.commit()
    if _mongo is not None and tables:
        update_all(db, tables)


def update(table: str, doc: dict) -> None:
    # upsert one row
    if _mongo is None:
        return
    key = KEY.get(table, "id")
    _mongo[table].update_one({key: doc[key]}, {"$set": doc}, upsert=True)


def update_all(db, tables) -> None:
    # push the named tables. one bulk round-trip each, then prune deletes.
    if _mongo is None:
        return
    for table in tables:
        key = KEY.get(table, "id")
        rows = _rows(db, table)
        if rows:
            _mongo[table].bulk_write([
                UpdateOne({key: r[key]}, {"$set": r}, upsert=True) for r in rows
            ], ordered=False)
        # drop anything the local db no longer has
        _mongo[table].delete_many({key: {"$nin": [r[key] for r in rows]}})


def pull(db) -> None:
    # cloud -> local, only if the cloud actually has something
    if _mongo is None:
        return
    if not any(_mongo[t].find_one({}) for t in SYNCED_TABLES):
        return
    for table in reversed(SYNCED_TABLES):
        db.execute(f"DELETE FROM {table}")
    for table in SYNCED_TABLES:
        docs = list(_mongo[table].find({}, {"_id": 0}))
        if not docs:
            continue
        cols = list(docs[0])
        db.executemany(
            f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
            [tuple(d.get(c) for c in cols) for d in docs],
        )
    db.commit()


def _rows(db, table) -> list[dict]:
    cur = db.execute(f"SELECT * FROM {table}")
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]
