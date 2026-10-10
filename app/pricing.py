# budget math. plain functions, no flask/db imports so it's testable on its own.

def calculate_budget(data):
    venue_fee = float(data.get("venue_fee", 0) or 0)
    artist_fees = [float(f) for f in (data.get("artist_fees") or [])]
    organizer_costs = float(data.get("organizer_costs", 0) or 0)
    admin_margin = float(data.get("admin_margin", 0) or 0)
    sponsorship = float(data.get("sponsorship", 0) or 0)

    pool = max(0, int(data.get("ticket_pool", 0) or 0))      # seats on sale -- the divisor
    capacity = max(0, int(data.get("venue_capacity", 0) or 0))
    price = float(data.get("ticket_price", 0) or 0)

    artists_total = round(sum(artist_fees), 2)
    total_expenses = round(venue_fee + artists_total + organizer_costs + admin_margin, 2)
    net_expense = round(max(0.0, total_expenses - sponsorship), 2)
    base_price = round(net_expense / pool, 2) if pool else 0.0

    # revenue comes from the real tier mix, not cheapest_price * seats
    tiers = [(float(p or 0), int(q or 0)) for p, q in (data.get("tiers") or []) if int(q or 0) > 0]
    if tiers:
        revenue = round(sum(p * q for p, q in tiers), 2)
        seats = sum(q for _, q in tiers)
        avg_price = round(revenue / seats, 2) if seats else 0.0
    else:
        revenue = round(price * pool, 2)
        avg_price = price

    profit = round(revenue - net_expense, 2)
    break_even = int(-(-net_expense // avg_price)) if avg_price else 0

    return {
        "venue_fee": venue_fee,
        "artists_total": artists_total,
        "organizer_costs": organizer_costs,
        "admin_margin": admin_margin,
        "total_expenses": total_expenses,
        "sponsorship": sponsorship,
        "net_expense": net_expense,
        "ticket_pool": pool,
        "venue_capacity": capacity,
        "ticket_price": price,
        "avg_ticket_price": avg_price,
        "base_ticket_price": base_price,
        "break_even_tickets": break_even,
        "projected_revenue": revenue,
        "profit": profit,
        "margin_pct": round(profit / revenue * 100, 1) if revenue else 0.0,
        "roi_pct": round(profit / net_expense * 100, 1) if net_expense else 0.0,
        "shortfall": round(max(0.0, net_expense - revenue), 2),
        "capacity": pool,
    }


def suggested_tier_prices(base_price):
    base = round(float(base_price or 0), 2)
    return {"base": base, "vip": round(base * 2, 2), "student": round(base * 0.6, 2)}
