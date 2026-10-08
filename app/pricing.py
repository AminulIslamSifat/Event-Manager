# pricing math. no flask/db imports so it stays testable on its own.
#
#   total expenses = venue + artists + organizer + margin
#   net            = total - sponsorship
#   base ticket    = net / capacity

from dataclasses import dataclass, field


@dataclass
class BudgetInput:
    # inputs for one event

    venue_fee: float = 0.0
    artist_fees: list[float] = field(default_factory=list)
    organizer_costs: float = 0.0
    admin_margin: float = 0.0
    sponsorship: float = 0.0
    capacity: int = 0


@dataclass
class BudgetResult:
    # result, drops straight into jsonify

    venue_fee: float
    artists_total: float
    organizer_costs: float
    admin_margin: float
    total_expenses: float
    sponsorship: float
    net_expense: float
    capacity: int
    base_ticket_price: float
    min_ticket_price: float      # never below zero
    break_even_tickets: int

    def as_dict(self) -> dict:
        return self.__dict__.copy()


# 2dp, so float noise never reaches the ui
def _money(value: float) -> float:
    return round(float(value or 0), 2)


def calculate_budget(data: BudgetInput, *, safety_buffer: float = 0.0) -> BudgetResult:
    # safety_buffer = extra fraction on top of expenses (0.05 = 5% contingency),
    # applied before sponsorship comes off
    venue_fee = _money(data.venue_fee)
    artists_total = _money(sum(data.artist_fees or []))
    organizer_costs = _money(data.organizer_costs)
    admin_margin = _money(data.admin_margin)
    sponsorship = _money(data.sponsorship)
    capacity = max(0, int(data.capacity or 0))

    subtotal = venue_fee + artists_total + organizer_costs + admin_margin
    buffer_amount = subtotal * max(0.0, safety_buffer)
    total_expenses = _money(subtotal + buffer_amount)

    # sponsorship can't push net negative
    net_expense = _money(max(0.0, total_expenses - sponsorship))

    base_ticket_price = _money(net_expense / capacity) if capacity > 0 else 0.0

    # tickets needed at the rounded price
    if base_ticket_price > 0:
        break_even = int(-(-net_expense // base_ticket_price))  # ceil division
    else:
        break_even = 0

    return BudgetResult(
        venue_fee=venue_fee,
        artists_total=artists_total,
        organizer_costs=organizer_costs,
        admin_margin=admin_margin,
        total_expenses=total_expenses,
        sponsorship=sponsorship,
        net_expense=net_expense,
        capacity=capacity,
        base_ticket_price=base_ticket_price,
        min_ticket_price=max(0.0, base_ticket_price),
        break_even_tickets=break_even,
    )


def suggested_tier_prices(base_price: float) -> dict[str, float]:
    # starting points only. vip pays more, student pays less. organiser overrides all of it.
    base = _money(base_price)
    return {
        "base": base,
        "vip": _money(base * 2),
        "student": _money(base * 0.6),
    }
