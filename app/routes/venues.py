# venue reference data. public reads (the form needs em), admin writes.

from flask import Blueprint, jsonify, request

from ..auth import admin_required, check_csrf
from ..db import get_db
from .. import sync

bp = Blueprint("venues", __name__, url_prefix="/api/venues")


def _payload(d: dict) -> tuple:
    # payload -> db tuple
    return (
        (d.get("name") or "").strip(),
        d.get("address", ""),
        int(d.get("capacity", 0) or 0),
        float(d.get("fee", 0) or 0),
        d.get("notes", ""),
    )


@bp.get("")
def list_venues():
    db = get_db()
    sql = "SELECT * FROM venues"
    if request.args.get("all") != "1":
        sql += " WHERE active = 1"
    rows = db.execute(sql + " ORDER BY fee DESC, name").fetchall()
    return jsonify([dict(r) for r in rows])


@bp.post("")
@admin_required
def create_venue():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    name, address, capacity, fee, notes = _payload(request.json or {})
    if not name:
        return jsonify({"error": "name is required"}), 400

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO venues (name, address, capacity, fee, notes) VALUES (?,?,?,?,?)",
            (name, address, capacity, fee, notes),
        )
        sync.commit(db, "venues")
    except Exception:
        return jsonify({"error": "a venue with that name already exists"}), 400

    return jsonify({"ok": True, "id": cur.lastrowid})


@bp.put("/<int:venue_id>")
@admin_required
def update_venue(venue_id: int):
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    name, address, capacity, fee, notes = _payload(d)

    db = get_db()
    if not db.execute("SELECT 1 FROM venues WHERE id=?", (venue_id,)).fetchone():
        return jsonify({"error": "venue not found"}), 404

    db.execute(
        """UPDATE venues
              SET name=?, address=?, capacity=?, fee=?, notes=?, active=?
            WHERE id=?""",
        (name, address, capacity, fee, notes,
         1 if d.get("active", True) else 0, venue_id),
    )
    sync.commit(db, "venues")
    return jsonify({"ok": True})


@bp.delete("/<int:venue_id>")
@admin_required
def delete_venue(venue_id: int):
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    db = get_db()
    # soft delete if an event points at it, so old budgets survive
    if db.execute("SELECT 1 FROM events WHERE venue_id=? LIMIT 1", (venue_id,)).fetchone():
        db.execute("UPDATE venues SET active=0 WHERE id=?", (venue_id,))
        sync.commit(db, "venues")
        return jsonify({"ok": True, "soft_deleted": True})

    db.execute("DELETE FROM venues WHERE id=?", (venue_id,))
    sync.commit(db, "venues")
    return jsonify({"ok": True})
