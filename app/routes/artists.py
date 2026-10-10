# artist reference data. public reads, admin writes.

from flask import Blueprint, jsonify, request

from ..auth import admin_required, check_csrf
from ..db import get_db
from .. import sync

bp = Blueprint("artists", __name__, url_prefix="/api/artists")


def _payload(d: dict) -> tuple:
    # payload -> db tuple
    return (
        (d.get("name") or "").strip(),
        d.get("genre", ""),
        float(d.get("fee", 0) or 0),
    )


@bp.get("")
def list_artists():
    db = get_db()
    sql = "SELECT * FROM artists"
    if request.args.get("all") != "1":
        sql += " WHERE active = 1"
    rows = db.execute(sql + " ORDER BY fee DESC, name").fetchall()
    return jsonify([dict(r) for r in rows])


@bp.post("")
@admin_required
def create_artist():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    name, genre, fee = _payload(request.json or {})
    if not name:
        return jsonify({"error": "name is required"}), 400

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO artists (name, genre, fee) VALUES (?,?,?)",
            (name, genre, fee),
        )
        sync.commit(db, "artists")
    except Exception:
        return jsonify({"error": "an artist with that name already exists"}), 400

    return jsonify({"ok": True, "id": cur.lastrowid})


@bp.put("/<int:artist_id>")
@admin_required
def update_artist(artist_id: int):
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    name, genre, fee = _payload(d)

    db = get_db()
    if not db.execute("SELECT 1 FROM artists WHERE id=?", (artist_id,)).fetchone():
        return jsonify({"error": "artist not found"}), 404

    db.execute(
        "UPDATE artists SET name=?, genre=?, fee=?, active=? WHERE id=?",
        (name, genre, fee, 1 if d.get("active", True) else 0, artist_id),
    )
    sync.commit(db, "artists")
    return jsonify({"ok": True})


@bp.delete("/<int:artist_id>")
@admin_required
def delete_artist(artist_id: int):
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    db = get_db()
    if db.execute("SELECT 1 FROM event_artists WHERE artist_id=? LIMIT 1", (artist_id,)).fetchone():
        db.execute("UPDATE artists SET active=0 WHERE id=?", (artist_id,))
        sync.commit(db, "artists")
        return jsonify({"ok": True, "soft_deleted": True})

    db.execute("DELETE FROM artists WHERE id=?", (artist_id,))
    sync.commit(db, "artists")
    return jsonify({"ok": True})