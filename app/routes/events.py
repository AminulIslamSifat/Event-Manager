# event CRUD + budget quote.
#
#  - any logged-in user can create
#  - new events start pending_payment, pay the fee to go published
#  - only published show in the public list
#  - only owner or admin can edit/delete

from flask import Blueprint, jsonify, request

from ..auth import current_user
from ..db import get_db
from .. import sync
from ..pricing import calculate_budget, suggested_tier_prices
from ..serializers import artist_rows, event_to_dict, tier_rows
from ..uploads import save_image

bp = Blueprint("events", __name__, url_prefix="/api/events")

PER_PAGE = 12

SORT_COLUMNS = {
    "date_asc": "e.date ASC",
    "date_desc": "e.date DESC",
    "price_asc": "e.price ASC",
    "price_desc": "e.price DESC",
    "newest": "e.created_at DESC",
}


# helpers

def _can_manage(event_row, user) -> bool:
    # owner or admin
    if not user:
        return False
    return user["role"] == "admin" or event_row["created_by"] == user["id"]


def _validate(d: dict) -> str | None:
    # error string, or None if the payload is fine
    if not (d.get("title") or "").strip():
        return "Title is required"
    if not (d.get("description") or "").strip():
        return "Description is required"
    if not d.get("date"):
        return "Date is required"
    if not (d.get("location") or "").strip():
        return "Location is required"

    try:
        price = float(d.get("price", 0) or 0)
        tickets = int(d.get("tickets", 0) or 0)
        capacity = int(d.get("venue_capacity", 0) or 0)
    except (TypeError, ValueError):
        return "Price and ticket counts must be numbers"

    if price < 0:
        return "Price cannot be negative"

    # tiers are the only place tickets exist -- there is no separate pool to
    # validate against any more.
    tiers = d.get("tiers") or []
    if not tiers:
        return "Add at least one ticket tier"

    tier_total = 0
    for tier in tiers:
        name = (tier.get("name") or "").strip()
        if not name:
            return "Every ticket tier needs a name"
        try:
            qty = int(tier.get("quantity", 0) or 0)
            tier_price = float(tier.get("price", 0) or 0)
        except (TypeError, ValueError):
            return f"Tier {name!r} has an invalid price or quantity"
        if qty < 1:
            return f"Tier {name!r} must have at least 1 seat"
        if tier_price < 0:
            return f"Tier {name!r} cannot have a negative price"
        tier_total += qty

    # the venue is the limit that actually matters
    if capacity > 0 and tier_total > capacity:
        return (f"Allocated {tier_total:,} seats but the venue holds {capacity:,}"
                f" — reduce a tier, or pick a bigger venue")

    # keep the stored pool in step with the tiers
    d["tickets"] = tier_total
    # and derive the display price from the cheapest tier
    d["price"] = min(float(t.get("price", 0) or 0) for t in tiers)

    return None


def _budget_from_payload(d: dict) -> dict:
    # budget for an incoming payload.
    #
    # the divisor is the ticket pool -- what is actually on sale -- NOT the
    # venue capacity. the old version preferred venue_capacity, so an organiser
    # selling 100 tickets in a 1000-seat room got a price calculated as if all
    # 1000 would sell. that under-prices by the ratio of the two.
    artist_fees = [float(f) for f in (d.get("artist_fees") or [])]
    tickets = int(d.get("tickets", 0) or 0)
    capacity = int(d.get("venue_capacity", 0) or 0)

    # revenue needs the real tier mix, not a single unit price
    tiers = [
        (float(t.get("price", 0) or 0), int(t.get("quantity", 0) or 0))
        for t in (d.get("tiers") or [])
    ]

    # only fall back to capacity when no pool has been set at all
    return calculate_budget({
        "venue_fee": float(d.get("venue_fee", 0) or 0),
        "artist_fees": artist_fees,
        "organizer_costs": float(d.get("organizer_costs", 0) or 0),
        "admin_margin": float(d.get("admin_margin", 0) or 0),
        "sponsorship": float(d.get("sponsorship", 0) or 0),
        "tiers": tiers,
        "ticket_pool": tickets or capacity,
        "venue_capacity": capacity,
        "ticket_price": float(d.get("price", 0) or 0),
    })


def _save_artists(db, event_id: int, artist_ids: list[int]) -> float:
    # replace the lineup, return the total fee.
    # fees are snapshotted so a later artist price change can't rewrite history.
    db.execute("DELETE FROM event_artists WHERE event_id=?", (event_id,))

    total = 0.0
    for artist_id in dict.fromkeys(artist_ids):  # de-dupe, keep order
        row = db.execute("SELECT fee FROM artists WHERE id=?", (artist_id,)).fetchone()
        if not row:
            continue
        db.execute(
            "INSERT INTO event_artists (event_id, artist_id, fee) VALUES (?,?,?)",
            (event_id, artist_id, row["fee"]),
        )
        total += float(row["fee"])
    return round(total, 2)


def _save_tiers(db, event_id: int, tiers: list[dict]) -> None:
    # replace the tiers
    db.execute("DELETE FROM ticket_tiers WHERE event_id=?", (event_id,))
    for tier in tiers or []:
        name = (tier.get("name") or "").strip()
        if not name:
            continue
        db.execute(
            "INSERT INTO ticket_tiers (event_id, name, price, quantity) VALUES (?,?,?,?)",
            (event_id, name, float(tier.get("price", 0) or 0), int(tier.get("quantity", 0) or 0)),
        )


# budget preview, no db writes

@bp.post("/quote")
def quote():
    # live calc for the event form
    d = request.json or {}
    budget = _budget_from_payload(d)
    return jsonify({
        "budget": budget,
        "suggested_tiers": suggested_tier_prices(budget["base_ticket_price"]),
    })


# listing + detail

@bp.get("")
def list_events():
    db = get_db()
    q = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "").strip()
    sort = request.args.get("sort", "date_asc")
    page = max(1, int(request.args.get("page", 1) or 1))
    upcoming = request.args.get("upcoming", "0")
    mine = request.args.get("mine") == "1"

    where, params = [], []
    user = current_user()

    if mine:
        # organiser sees their own drafts too
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        if user["role"] == "admin" and request.args.get("all") == "1":
            pass  # admin, no filter
        else:
            where.append("e.created_by = ?")
            params.append(user["id"])
    else:
        where.append("e.status = 'published'")

    if q:
        where.append("(e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)")
        params.extend([f"%{q}%"] * 3)

    if category and category != "All":
        where.append("e.category = ?")
        params.append(category)

    if upcoming == "1":
        where.append("e.date >= datetime('now')")

    sql_where = "WHERE " + " AND ".join(where)
    order = SORT_COLUMNS.get(sort, SORT_COLUMNS["date_asc"])

    total = db.execute(f"SELECT COUNT(*) AS c FROM events e {sql_where}", params).fetchone()["c"]
    offset = (page - 1) * PER_PAGE

    rows = db.execute(
        f"""SELECT e.*, u.username AS creator
              FROM events e
              JOIN users u ON e.created_by = u.id
              {sql_where}
             ORDER BY {order}
             LIMIT ? OFFSET ?""",
        params + [PER_PAGE, offset],
    ).fetchall()

    categories = [r["category"] for r in db.execute(
        "SELECT DISTINCT category FROM events WHERE status='published' ORDER BY category"
    ).fetchall()]

    return jsonify({
        "events": [event_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "pages": max(1, (total + PER_PAGE - 1) // PER_PAGE),
        "categories": categories,
    })


@bp.get("/<int:event_id>")
def get_event(event_id: int):
    db = get_db()
    row = db.execute(
        """SELECT e.*, u.username AS creator
             FROM events e
             JOIN users u ON e.created_by = u.id
            WHERE e.id = ?""",
        (event_id,),
    ).fetchone()

    if not row:
        return jsonify({"error": "not found"}), 404

    # drafts only visible to owner/admin
    if row["status"] != "published" and not _can_manage(row, current_user()):
        return jsonify({"error": "not found"}), 404

    return jsonify(event_to_dict(row, db, detailed=True))


# create / update / delete

@bp.post("")
def create_event():
    # any logged-in user, lands as a draft until the fee is paid

    user = current_user()
    if not user:
        return jsonify({"error": "sign in to create an event"}), 401

    d = request.json or {}
    error = _validate(d)
    if error:
        return jsonify({"error": error}), 400

    db = get_db()
    budget = _budget_from_payload(d)

    cur = db.execute(
        """INSERT INTO events
             (title, description, date, location, price, tickets, category, image_url, created_by,
              venue_id, venue_name, venue_fee, venue_capacity, artists_total, organizer_costs,
              admin_margin, sponsorship, has_smoke_detector, has_drug_detector, security_notes,
              status, platform_fee_paid)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_payment',0)""",
        (
            d["title"].strip(), d["description"].strip(), d["date"], d["location"].strip(),
            float(d.get("price", 0) or 0), int(d.get("tickets", 0) or 0),
            d.get("category", "General"), d.get("image_url", ""), user["id"],
            d.get("venue_id"), d.get("venue_name", ""), float(d.get("venue_fee", 0) or 0),
            int(d.get("venue_capacity", 0) or 0), budget["artists_total"],
            float(d.get("organizer_costs", 0) or 0), float(d.get("admin_margin", 0) or 0),
            float(d.get("sponsorship", 0) or 0),
            1 if d.get("has_smoke_detector") else 0,
            1 if d.get("has_drug_detector") else 0,
            d.get("security_notes", ""),
        ),
    )
    event_id = cur.lastrowid

    artist_total = _save_artists(db, event_id, d.get("artist_ids") or [])
    db.execute("UPDATE events SET artists_total=? WHERE id=?", (artist_total, event_id))
    _save_tiers(db, event_id, d.get("tiers") or [])

    sync.commit(db, "events", "event_artists", "ticket_tiers")
    return jsonify({"ok": True, "id": event_id, "status": "pending_payment"})


@bp.put("/<int:event_id>")
def update_event(event_id: int):

    db = get_db()
    row = db.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    if not row:
        return jsonify({"error": "event not found"}), 404
    if not _can_manage(row, current_user()):
        return jsonify({"error": "forbidden"}), 403

    d = request.json or {}
    error = _validate(d)
    if error:
        return jsonify({"error": error}), 400

    db.execute(
        """UPDATE events
              SET title=?, description=?, date=?, location=?, price=?, tickets=?,
                  category=?, image_url=?, venue_id=?, venue_name=?, venue_fee=?,
                  venue_capacity=?, organizer_costs=?, admin_margin=?, sponsorship=?,
                  has_smoke_detector=?, has_drug_detector=?, security_notes=?
            WHERE id=?""",
        (
            d["title"].strip(), d["description"].strip(), d["date"], d["location"].strip(),
            float(d.get("price", 0) or 0), int(d.get("tickets", 0) or 0),
            d.get("category", "General"), d.get("image_url", ""),
            d.get("venue_id"), d.get("venue_name", ""), float(d.get("venue_fee", 0) or 0),
            int(d.get("venue_capacity", 0) or 0), float(d.get("organizer_costs", 0) or 0),
            float(d.get("admin_margin", 0) or 0), float(d.get("sponsorship", 0) or 0),
            1 if d.get("has_smoke_detector") else 0,
            1 if d.get("has_drug_detector") else 0,
            d.get("security_notes", ""),
            event_id,
        ),
    )

    if "artist_ids" in d:
        total = _save_artists(db, event_id, d.get("artist_ids") or [])
        db.execute("UPDATE events SET artists_total=? WHERE id=?", (total, event_id))

    if "tiers" in d:
        _save_tiers(db, event_id, d.get("tiers") or [])

    sync.commit(db, "events", "event_artists", "ticket_tiers")
    return jsonify({"ok": True})


@bp.delete("/<int:event_id>")
def delete_event(event_id: int):

    db = get_db()
    row = db.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    if not row:
        return jsonify({"error": "event not found"}), 404
    if not _can_manage(row, current_user()):
        return jsonify({"error": "forbidden"}), 403

    db.execute("DELETE FROM bookings WHERE event_id=?", (event_id,))
    db.execute("DELETE FROM event_artists WHERE event_id=?", (event_id,))
    db.execute("DELETE FROM ticket_tiers WHERE event_id=?", (event_id,))
    db.execute("DELETE FROM events WHERE id=?", (event_id,))
    sync.commit(db, "events", "event_artists", "ticket_tiers", "bookings")
    return jsonify({"ok": True})


# publish (dummy fee gate)

@bp.post("/<int:event_id>/publish")
def publish_event(event_id: int):
    # pay the fee, go live. payment is a stub -- swap the marked block for a
    # real gateway and the rest of this flow doesn't change.

    db = get_db()
    row = db.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    if not row:
        return jsonify({"error": "event not found"}), 404
    if not _can_manage(row, current_user()):
        return jsonify({"error": "forbidden"}), 403

    fee_row = db.execute("SELECT value FROM settings WHERE key='platform_fee'").fetchone()
    platform_fee = float(fee_row["value"]) if fee_row else 0.0

    d = request.json or {}
    method = d.get("method", "card")

    # dummy gate, swap for a real gateway
    if method == "card":
        card = (d.get("card_number") or "").replace(" ", "")
        if len(card) < 13 or not card.isdigit():
            return jsonify({"error": "invalid card number"}), 400
        if card.endswith("0000"):
            return jsonify({"error": "payment declined (demo: cards ending 0000 fail)"}), 402

    import time
    txn = f"PLATFORM-{int(time.time() * 1000)}-{event_id}"

    db.execute(
        "UPDATE events SET status='published', platform_fee_paid=1 WHERE id=?",
        (event_id,),
    )
    sync.commit(db, "events")
    return jsonify({"ok": True, "transaction_id": txn, "platform_fee": platform_fee})


@bp.get("/<int:event_id>/lineup")
def get_lineup(event_id: int):
    # lineup + tiers for one event
    db = get_db()
    if not db.execute("SELECT 1 FROM events WHERE id=?", (event_id,)).fetchone():
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "artists": artist_rows(db, event_id),
        "tiers": tier_rows(db, event_id),
    })


# cover image upload

@bp.post("/upload-image")
def upload_image():
    user = current_user()
    if not user:
        return jsonify({"error": "sign in to upload an image"}), 401

    try:
        url = save_image(request.files.get("image"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:                      # noqa: BLE001
        return jsonify({"error": f"Upload failed: {exc}"}), 500

    return jsonify({"ok": True, "image_url": url})