"""
Row → JSON conversion helpers shared by the blueprints.

Kept separate so every endpoint returns events in exactly the same shape.
"""

import sqlite3

from . import pricing, thumbs


def artist_rows(db: sqlite3.Connection, event_id: int) -> list[dict]:
    """Artists booked for an event, with their snapshotted fee."""
    rows = db.execute(
        """
        SELECT ea.artist_id, ea.fee, a.name, a.genre
          FROM event_artists ea
          JOIN artists a ON a.id = ea.artist_id
         WHERE ea.event_id = ?
         ORDER BY ea.fee DESC, a.name
        """,
        (event_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def tier_rows(db: sqlite3.Connection, event_id: int) -> list[dict]:
    """Ticket tiers for an event."""
    rows = db.execute(
        "SELECT id, name, price, quantity, sold FROM ticket_tiers WHERE event_id=? ORDER BY price DESC",
        (event_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def budget_for(row: sqlite3.Row, artist_fees: list[float] | None = None) -> dict:
    """
    Recompute the budget breakdown from stored event columns.

    `artist_fees` is optional: pass it when we already fetched the artist
    rows, otherwise the denormalised `artists_total` column is used.
    """
    keys = row.keys()

    def get(name, default=0):
        return row[name] if name in keys and row[name] is not None else default

    if artist_fees is None:
        total = float(get("artists_total", 0))
        artist_fees = [total] if total else []

    result = pricing.calculate_budget(
        pricing.BudgetInput(
            venue_fee=float(get("venue_fee", 0)),
            artist_fees=artist_fees,
            organizer_costs=float(get("organizer_costs", 0)),
            admin_margin=float(get("admin_margin", 0)),
            sponsorship=float(get("sponsorship", 0)),
            capacity=int(get("venue_capacity", 0) or get("tickets", 0)),
        )
    )
    return result.as_dict()


def event_to_dict(row: sqlite3.Row, db=None, *, detailed: bool = False) -> dict:
    """
    Convert an event row into the API representation.

    `detailed=True` also embeds the artist lineup and ticket tiers, which
    the list view doesn't need.
    """
    data = dict(row)

    # Every event gets a picture: the uploaded one when present, otherwise the
    # default illustration for its category.
    if not (data.get("image_url") or "").strip():
        data["image_url"] = thumbs.thumbnail_url(data.get("category"))
        data["image_is_default"] = True
    else:
        data["image_is_default"] = False

    artist_fees = None
    if detailed and db is not None:
        artists = artist_rows(db, row["id"])
        data["artists"] = artists
        data["tiers"] = tier_rows(db, row["id"])
        artist_fees = [a["fee"] for a in artists]

    data["budget"] = budget_for(row, artist_fees)
    data["is_published"] = data.get("status") == "published"
    return data