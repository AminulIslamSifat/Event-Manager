# booking + payment.
#
#   free  -> confirmed right away
#   paid  -> pending_payment -> confirmed (/pay)
#                            -> failed (rolled back, seats returned)
#
# seats are held on booking and released on failure/cancel, so the count stays honest.

from flask import Blueprint, jsonify, request, session

from ..auth import check_csrf, login_required
from ..db import get_db
from .. import sync

bp = Blueprint("bookings", __name__, url_prefix="/api")


# booking

def _reserve(db, event_id: int, tier_id, quantity: int) -> bool:
    # atomic decrement, False if there wasn't enough.
    # the WHERE guard is what makes this concurrency-safe -- if someone else
    # grabbed the seats first rowcount comes back 0 and we back out.
    cur = db.execute(
        "UPDATE events SET tickets = tickets - ? WHERE id=? AND tickets >= ?",
        (quantity, event_id, quantity),
    )
    if cur.rowcount == 0:
        return False

    if tier_id:
        cur = db.execute(
            "UPDATE ticket_tiers SET sold = sold + ? "
            "WHERE id=? AND quantity - sold >= ?",
            (quantity, tier_id, quantity),
        )
        if cur.rowcount == 0:
            db.rollback()
            return False

    return True


@bp.post("/book")
@login_required
def book():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    quantity = int(d.get("quantity", 0) or 0)
    event_id = int(d.get("event_id", 0) or 0)
    tier_id = d.get("tier_id")

    if quantity < 1:
        return jsonify({"error": "quantity must be at least 1"}), 400

    db = get_db()
    event = db.execute(
        "SELECT tickets, title, price, status FROM events WHERE id=?", (event_id,)
    ).fetchone()
    if not event:
        return jsonify({"error": "Event not found"}), 404
    if event["status"] != "published":
        return jsonify({"error": "This event is not on sale yet"}), 400

    # tier, when picked, sets the price and has its own stock
    tier_name = ""
    unit_price = float(event["price"])
    tier = None
    if tier_id:
        tier = db.execute(
            "SELECT * FROM ticket_tiers WHERE id=? AND event_id=?", (tier_id, event_id)
        ).fetchone()
        if not tier:
            return jsonify({"error": "Ticket tier not found"}), 404

        tier_remaining = tier["quantity"] - tier["sold"]
        if tier_remaining < quantity:
            return jsonify({
                "error": f"Only {tier_remaining} left in {tier['name']}"
            }), 400

        unit_price = float(tier["price"])
        tier_name = tier["name"]

    # event pool is the final say, tier or not
    if event["tickets"] < quantity:
        return jsonify({"error": f"Only {event['tickets']} tickets left"}), 400

    total = round(unit_price * quantity, 2)

    # free -> confirm right away
    if total <= 0:
        if not _reserve(db, event_id, tier_id, quantity):
            db.rollback()
            return jsonify({"error": "Those tickets just sold out"}), 409

        db.execute(
            """INSERT INTO bookings
                 (user_id, event_id, quantity, status, payment_method, transaction_id, tier_id, tier_name)
               VALUES (?,?,?,'confirmed','free','FREE-000',?,?)""",
            (session["user_id"], event_id, quantity, tier_id, tier_name),
        )
        sync.commit(db, "bookings", "events", "ticket_tiers")

        booking_id = db.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        return jsonify({
            "ok": True, "booking_id": booking_id, "title": event["title"],
            "total": 0, "quantity": quantity, "free": True,
        })

    # paid -> hold the seats until payment
    if not _reserve(db, event_id, tier_id, quantity):
        db.rollback()
        return jsonify({"error": "Those tickets just sold out"}), 409

    db.execute(
        """INSERT INTO bookings
             (user_id, event_id, quantity, status, tier_id, tier_name)
           VALUES (?,?,?,'pending_payment',?,?)""",
        (session["user_id"], event_id, quantity, tier_id, tier_name),
    )
    sync.commit(db, "bookings", "events", "ticket_tiers")

    booking_id = db.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    return jsonify({
        "ok": True, "booking_id": booking_id, "title": event["title"],
        "total": total, "quantity": quantity, "free": False,
    })


# payment

def _release_tickets(db, booking) -> None:
    # give the seats back to the event and its tier
    db.execute("UPDATE events SET tickets = tickets + ? WHERE id=?",
               (booking["quantity"], booking["event_id"]))
    if booking["tier_id"]:
        db.execute("UPDATE ticket_tiers SET sold = MAX(0, sold - ?) WHERE id=?",
                   (booking["quantity"], booking["tier_id"]))


@bp.post("/pay")
@login_required
def pay():
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    d = request.json or {}
    booking_id = int(d.get("booking_id", 0) or 0)
    method = d.get("method", "card")
    card = (d.get("card_number") or "").replace(" ", "")

    db = get_db()
    booking = db.execute(
        "SELECT * FROM bookings WHERE id=? AND user_id=? AND status='pending_payment'",
        (booking_id, session["user_id"]),
    ).fetchone()

    if not booking:
        return jsonify({"error": "booking not found or already paid"}), 404

    # demo validation
    if method == "card":
        if len(card) < 13 or not card.isdigit():
            return jsonify({"error": "invalid card number"}), 400
        if not (card.startswith("4") or card.startswith("5")):
            return jsonify({"error": "only Visa (4xxx) and Mastercard (5xxx) accepted in demo"}), 400

    import time
    txn = f"TXN-{int(time.time() * 1000)}-{booking_id}"

    # 0000 always fails so the failure path stays testable
    if method == "card" and card.endswith("0000"):
        db.execute("UPDATE bookings SET status='failed', payment_method=?, transaction_id=? WHERE id=?",
                   (method, txn, booking_id))
        _release_tickets(db, booking)
        sync.commit(db, "bookings", "events", "ticket_tiers")
        return jsonify({"error": "payment declined by bank (demo: cards ending in 0000 fail)"}), 402

    db.execute("UPDATE bookings SET status='confirmed', payment_method=?, transaction_id=? WHERE id=?",
               (method, txn, booking_id))
    sync.commit(db, "bookings")
    return jsonify({"ok": True, "transaction_id": txn, "method": method})


# listing + cancellation

@bp.get("/bookings")
@login_required
def my_bookings():
    db = get_db()
    rows = db.execute(
        """SELECT b.*, e.title, e.date, e.location, e.price
             FROM bookings b
             JOIN events e ON b.event_id = e.id
            WHERE b.user_id = ? AND b.status IN ('confirmed','pending_payment')
            ORDER BY b.booked_at DESC""",
        (session["user_id"],),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@bp.delete("/bookings/<int:booking_id>")
@login_required
def cancel_booking(booking_id: int):
    if not check_csrf():
        return jsonify({"error": "invalid csrf token"}), 403

    db = get_db()
    booking = db.execute(
        "SELECT * FROM bookings WHERE id=? AND user_id=? AND status='confirmed'",
        (booking_id, session["user_id"]),
    ).fetchone()

    if not booking:
        return jsonify({"error": "booking not found"}), 404

    db.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (booking_id,))
    _release_tickets(db, booking)
    sync.commit(db, "bookings", "events", "ticket_tiers")
    return jsonify({"ok": True})