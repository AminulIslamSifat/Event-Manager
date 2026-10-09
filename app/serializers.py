# row -> json helpers. shared so every endpoint returns the same event shape.

import sqlite3

from . import pricing, thumbs


def artist_rows(db: sqlite3.Connection, event_id: int) -> list[dict]:
    # artists on an event, with the fee snapshot
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
    # tiers for an event
    rows = db.execute(
        "SELECT id, name, price, quantity, sold FROM ticket_tiers WHERE event_id=? ORDER BY price DESC",
        (event_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def budget_for(
    row: sqlite3.Row,
    artist_fees: list[float] | None = None,
    tiers: list[dict] | None = None,
) -> dict:
    # rebuild the budget from stored columns.
    # pass artist_fees if already fetched, else falls back to artists_total.
    # pass tiers so revenue reflects the real price mix.
    keys = row.keys()

    def get(name, default=0):
        return row[name] if name in keys and row[name] is not None else default

    if artist_fees is None:
        total = float(get("artists_total", 0))
        artist_fees = [total] if total else []

    # same rule as the write path: price against the seat pool, not the venue.
    # this one used to be inverted too, so the budget shown on an existing
    # event disagreed with the one shown while creating it.
    tickets = int(get("tickets", 0) or 0)
    capacity = int(get("venue_capacity", 0) or 0)

    tier_pairs = [
        (float(t.get("price", 0) or 0), int(t.get("quantity", 0) or 0))
        for t in (tiers or [])
    ]

    result = pricing.calculate_budget(
        pricing.BudgetInput(
            venue_fee=float(get("venue_fee", 0)),
            artist_fees=artist_fees,
            organizer_costs=float(get("organizer_costs", 0)),
            admin_margin=float(get("admin_margin", 0)),
            sponsorship=float(get("sponsorship", 0)),
            tiers=tier_pairs,
            ticket_pool=tickets or capacity,
            venue_capacity=capacity,
            ticket_price=float(get("price", 0)),
        )
    )
    return result.as_dict()


def event_to_dict(row: sqlite3.Row, db=None, *, detailed: bool = False) -> dict:
    # event row -> api dict. detailed=True adds lineup + tiers (list view doesn't need em)
    data = dict(row)

    # uploaded image if there is one, else the category default
    if not (data.get("image_url") or "").strip():
        data["image_url"] = thumbs.thumbnail_url(data.get("category"))
        data["image_is_default"] = True
    else:
        data["image_is_default"] = False

    artist_fees = None
    tiers = None
    if detailed and db is not None:
        artists = artist_rows(db, row["id"])
        tiers = tier_rows(db, row["id"])
        data["artists"] = artists
        data["tiers"] = tiers
        artist_fees = [a["fee"] for a in artists]
    elif db is not None:
        # the list view has no tiers in the payload, but budget.profit still
        # needs them -- fetch quietly rather than reporting a fake loss.
        tiers = tier_rows(db, row["id"])

    data["budget"] = budget_for(row, artist_fees, tiers)
    data["is_published"] = data.get("status") == "published"
    return data