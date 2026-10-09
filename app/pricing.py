# pricing math. no flask/db imports so it stays testable on its own.
#
#   total expenses = venue + artists + organizer + margin
#   net            = total - sponsorship
#   price to break even = net / seats
#   revenue        = SUM(tier price x tier seats)
#   profit         = revenue - net
#
# two traps this file exists to avoid:
#   1. the divisor is the SEAT POOL (what is on sale), never the venue's
#      physical capacity. those are different numbers.
#   2. revenue is the sum over tiers, not cheapest_price x seats. using the
#      cheapest price for every seat silently understates a mixed-price event.

from dataclasses import dataclass, field


@dataclass
class BudgetInput:
    # inputs for one event

    venue_fee: float = 0.0
    artist_fees: list[float] = field(default_factory=list)
    organizer_costs: float = 0.0
    admin_margin: float = 0.0
    sponsorship: float = 0.0

    # (price, quantity) per tier. this is what revenue is actually computed
    # from -- pass it whenever tiers exist.
    tiers: list[tuple[float, int]] = field(default_factory=list)

    # how many seats are actually on sale. THIS is the divisor.
    ticket_pool: int = 0
    # the venue's physical limit. validation only -- never used for pricing.
    venue_capacity: int = 0
    # fallback unit price, used only when no tiers are supplied.
    ticket_price: float = 0.0


@dataclass
class BudgetResult:
    # result, drops straight into jsonify

    # costs
    venue_fee: float
    artists_total: float
    organizer_costs: float
    admin_margin: float
    total_expenses: float
    sponsorship: float
    net_expense: float

    # capacity
    ticket_pool: int
    venue_capacity: int
    ticket_price: float
    avg_ticket_price: float

    # break-even
    base_ticket_price: float          # net / seats -- what you MUST charge
    break_even_tickets: int           # ceil(net / avg price)

    # sell-out projection
    projected_revenue: float
    profit: float
    margin_pct: float                 # profit / revenue
    roi_pct: float                    # profit / net expense
    shortfall: float                  # max(0, net - revenue)

    # kept so existing callers keep working; mirrors ticket_pool
    capacity: int

    def as_dict(self) -> dict:
        return self.__dict__.copy()


# 2dp, so float noise never reaches the ui
def _money(value: float) -> float:
    return round(float(value or 0), 2)


def _pct(numerator: float, denominator: float) -> float:
    if not denominator:
        return 0.0
    return round((numerator / denominator) * 100, 1)


def calculate_budget(data: BudgetInput, *, safety_buffer: float = 0.0) -> BudgetResult:
    # safety_buffer = extra fraction on top of expenses (0.05 = 5% contingency),
    # applied before sponsorship comes off
    venue_fee = _money(data.venue_fee)
    artists_total = _money(sum(data.artist_fees or []))
    organizer_costs = _money(data.organizer_costs)
    admin_margin = _money(data.admin_margin)
    sponsorship = _money(data.sponsorship)

    pool = max(0, int(data.ticket_pool or 0))
    venue_capacity = max(0, int(data.venue_capacity or 0))
    fallback_price = _money(data.ticket_price)

    subtotal = venue_fee + artists_total + organizer_costs + admin_margin
    buffer_amount = subtotal * max(0.0, safety_buffer)
    total_expenses = _money(subtotal + buffer_amount)

    # sponsorship can't push net negative
    net_expense = _money(max(0.0, total_expenses - sponsorship))

    # the price that covers costs if every seat sells
    base_ticket_price = _money(net_expense / pool) if pool > 0 else 0.0

    # ---- revenue ----
    # sum over the real tier mix. the old version used cheapest_price x pool,
    # which is only correct when every seat costs the same -- on a mixed event
    # it understated sell-out revenue and could report a loss on a profitable
    # lineup (or vice versa).
    tiers = [(float(p or 0), int(q or 0)) for p, q in (data.tiers or [])]
    tiers = [(p, q) for p, q in tiers if q > 0]

    if tiers:
        projected_revenue = _money(sum(p * q for p, q in tiers))
        tier_seats = sum(q for _, q in tiers)
        avg_ticket_price = _money(projected_revenue / tier_seats) if tier_seats else 0.0
    else:
        projected_revenue = _money(fallback_price * pool)
        avg_ticket_price = fallback_price

    # how many seats at the average price to cover costs
    if avg_ticket_price > 0:
        break_even_tickets = int(-(-net_expense // avg_ticket_price))  # ceil division
    else:
        break_even_tickets = 0

    profit = _money(projected_revenue - net_expense)
    shortfall = _money(max(0.0, net_expense - projected_revenue))

    return BudgetResult(
        venue_fee=venue_fee,
        artists_total=artists_total,
        organizer_costs=organizer_costs,
        admin_margin=admin_margin,
        total_expenses=total_expenses,
        sponsorship=sponsorship,
        net_expense=net_expense,
        ticket_pool=pool,
        venue_capacity=venue_capacity,
        ticket_price=fallback_price,
        avg_ticket_price=avg_ticket_price,
        base_ticket_price=base_ticket_price,
        break_even_tickets=break_even_tickets,
        projected_revenue=projected_revenue,
        profit=profit,
        margin_pct=_pct(profit, projected_revenue),
        roi_pct=_pct(profit, net_expense),
        shortfall=shortfall,
        capacity=pool,
    )


def suggested_tier_prices(base_price: float) -> dict[str, float]:
    # starting points only. vip pays more, student pays less. organiser overrides all of it.
    base = _money(base_price)
    return {
        "base": base,
        "vip": _money(base * 2),
        "student": _money(base * 0.6),
    }
