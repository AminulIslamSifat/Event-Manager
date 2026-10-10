# admin only: stats, csv export, settings

from flask import Blueprint, Response, jsonify, request

from ..auth import admin_required
from ..db import get_db
from .. import sync

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@bp.get("/stats")
@admin_required
def stats():
    db = get_db()

    total_events = db.execute("SELECT COUNT(*) AS c FROM events").fetchone()["c"]
    published = db.execute("SELECT COUNT(*) AS c FROM events WHERE status='published'").fetchone()["c"]
    drafts = db.execute("SELECT COUNT(*) AS c FROM events WHERE status='pending_payment'").fetchone()["c"]
    total_bookings = db.execute("SELECT COUNT(*) AS c FROM bookings WHERE status='confirmed'").fetchone()["c"]

    revenue = db.execute(
        """SELECT COALESCE(SUM(b.quantity * e.price), 0) AS r
             FROM bookings b JOIN events e ON b.event_id = e.id
            WHERE b.status = 'confirmed'"""
    ).fetchone()["r"]

    # production spend. NOTE: no clamp here, unlike pricing.py -- heavily
    # sponsored events go negative instead of bottoming out at 0.
    spend = db.execute(
        """SELECT COALESCE(SUM(venue_fee + artists_total + organizer_costs + admin_margin - sponsorship), 0) AS s
             FROM events WHERE status = 'published'"""
    ).fetchone()["s"]

    popular = db.execute(
        """SELECT e.title, SUM(b.quantity) AS sold
             FROM bookings b JOIN events e ON b.event_id = e.id
            WHERE b.status = 'confirmed'
            GROUP BY e.id
            ORDER BY sold DESC
            LIMIT 5"""
    ).fetchall()

    return jsonify({
        "total_events": total_events,
        "published_events": published,
        "draft_events": drafts,
        "total_bookings": total_bookings,
        "revenue": round(revenue, 2),
        "production_spend": round(spend, 2),
        "popular": [dict(p) for p in popular],
    })


@bp.get("/settings")
@admin_required
def get_settings():
    db = get_db()
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return jsonify({r["key"]: r["value"] for r in rows})


@bp.put("/settings")
@admin_required
def update_settings():

    db = get_db()
    for key, value in (request.json or {}).items():
        db.execute(
            "INSERT INTO settings (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )
    sync.commit(db, "settings")
    return jsonify({"ok": True})


@bp.get("/export-bookings")
@admin_required
def export_bookings():
    db = get_db()
    rows = db.execute(
        """SELECT u.username, e.title, e.date, e.location, b.quantity,
                  e.price, b.quantity * e.price AS total, b.tier_name, b.booked_at
             FROM bookings b
             JOIN users u  ON b.user_id = u.id
             JOIN events e ON b.event_id = e.id
            WHERE b.status = 'confirmed'
            ORDER BY b.booked_at DESC"""
    ).fetchall()

    lines = ["Username,Event,Date,Location,Qty,Price,Total,Tier,Booked At"]
    for r in rows:
        lines.append(
            f'"{r["username"]}","{r["title"]}","{r["date"]}","{r["location"]}",'
            f'{r["quantity"]},{r["price"]},{r["total"]},"{r["tier_name"] or ""}","{r["booked_at"]}"'
        )

    return Response(
        "\n".join(lines),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=bookings.csv"},
    )