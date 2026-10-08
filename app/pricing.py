"""
Pricing engine — pure functions, no Flask or database imports.

Keeping the money math isolated means it can be unit-tested directly and
reused by the API, the CLI, or a future export tool.

Formula (per spec):

    Total Expenses = Venue Fee
                   + Σ(Selected Artist Fees)
                   + Organizer Costs
                   + Admin Margin

    Net Expense    = Total Expenses − Sponsorship

    Base Ticket    = Net Expense ÷ Venue Capacity
"""

from dataclasses import dataclass, field


@dataclass
class BudgetInput:
    """Everything needed to price one event."""

    venue_fee: float = 0.0
    artist_fees: list[float] = field(default_factory=list)
    organizer_costs: float = 0.0
    admin_margin: float = 0.0
    sponsorship: float = 0.0
    capacity: int = 0


@dataclass
class BudgetResult:
    """Computed budget breakdown, ready to serialise straight to JSON."""

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


# Round every monetary result to 2dp so floating-point noise never reaches the UI.
def _money(value: float) -> float:
    return round(float(value or 0), 2)


def calculate_budget(data: BudgetInput, *, safety_buffer: float = 0.0) -> BudgetResult:
    """
    Compute the full budget for an event.

    `safety_buffer` is an optional extra fraction (e.g. 0.05 for 5%
    contingencies) added on top of total expenses before sponsorship is
    deducted.
    """
    venue_fee = _money(data.venue_fee)
    artists_total = _money(sum(data.artist_fees or []))
    organizer_costs = _money(data.organizer_costs)
    admin_margin = _money(data.admin_margin)
    sponsorship = _money(data.sponsorship)
    capacity = max(0, int(data.capacity or 0))

    subtotal = venue_fee + artists_total + organizer_costs + admin_margin
    buffer_amount = subtotal * max(0.0, safety_buffer)
    total_expenses = _money(subtotal + buffer_amount)

    # Sponsorship can never push the net below zero.
    net_expense = _money(max(0.0, total_expenses - sponsorship))

    base_ticket_price = _money(net_expense / capacity) if capacity > 0 else 0.0

    # Break-even counts tickets needed at the rounded price.
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
    """
    Sensible starting points for tiered pricing.

    VIP pays a premium, Student gets a discount — organisers can override
    every number in the UI.
    """
    base = _money(base_price)
    return {
        "base": base,
        "vip": _money(base * 2),
        "student": _money(base * 0.6),
    }
