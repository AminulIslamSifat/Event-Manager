// live budget panel for the event form.
// just calls /api/events/quote -- the real calc happens server-side on save,
// this only exists so the organiser sees numbers move while typing.

import { post } from "../api.js";
import { esc, formatMoney, formatMoneyExact, val } from "../utils.js";

// fees of every ticked artist
function selectedArtistFees() {
  return [...document.querySelectorAll(".artist-check:checked")]
    .map((el) => Number(el.dataset.fee) || 0);
}

// ids of every ticked artist
export function selectedArtistIds() {
  return [...document.querySelectorAll(".artist-check:checked")]
    .map((el) => Number(el.value));
}

// every field the pricing engine cares about
export function collectBudgetInput() {
  return {
    venue_fee: Number(val("f-venue-fee")) || 0,
    venue_capacity: Number(val("f-capacity")) || 0,
    artist_fees: selectedArtistFees(),
    organizer_costs: Number(val("f-organizer")) || 0,
    admin_margin: Number(val("f-margin")) || 0,
    sponsorship: Number(val("f-sponsor")) || 0,
  };
}

// breakdown markup for the sticky panel
function breakdownHtml(b) {
  const row = (label, amount, cls = "") =>
    `<div class="budget-row ${cls}">
       <span>${label}</span>
       <span class="amount">${formatMoneyExact(amount)}</span>
     </div>`;

  const artistCount = selectedArtistFees().length;

  return `
    <h3>Budget breakdown</h3>

    ${row("Venue fee", b.venue_fee)}
    ${row(`Artists (${artistCount})`, b.artists_total, "sub")}
    ${row("Organizer costs", b.organizer_costs, "sub")}
    ${row("Platform margin", b.admin_margin, "sub")}

    <hr class="budget-divider">
    ${row("Total expenses", b.total_expenses, "total")}

    ${b.sponsorship > 0 ? row("Less sponsorship", -b.sponsorship, "sub") : ""}

    <hr class="budget-divider">
    <div class="budget-row total">
      <span>Net to recover</span>
      <span class="amount">${formatMoneyExact(b.net_expense)}</span>
    </div>

    <div class="budget-result">
      <div class="label">Base ticket price</div>
      <div class="value">${b.capacity > 0 ? formatMoneyExact(b.base_ticket_price) : "—"}</div>
      <div class="hint">
        ${b.capacity > 0
          ? `${formatMoney(b.net_expense)} ÷ ${b.capacity.toLocaleString("en-IN")} seats`
          : "Set a venue capacity"}
      </div>
      ${b.break_even_tickets > 0
        ? `<div class="hint" style="margin-top:0.35rem">Break-even at ${b.break_even_tickets.toLocaleString("en-IN")} tickets</div>`
        : ""}
    </div>`;
}

// recalc via the server, repaint.
// errors show inline instead of throwing so typing never breaks.
export async function refreshBudget(panelEl) {
  if (!panelEl) return null;

  panelEl.classList.add("is-busy");

  try {
    const data = await post("/api/events/quote", collectBudgetInput());
    panelEl.innerHTML = breakdownHtml(data.budget);
    return data;
  } catch (err) {
    panelEl.innerHTML = `<h3>Budget breakdown</h3>
      <p class="muted" style="font-size:0.8rem">${esc(err.message)}</p>`;
    return null;
  } finally {
    panelEl.classList.remove("is-busy");
  }
}

// any relevant field edit recalcs
export function wireBudgetInputs(panelEl, { onRecalculate } = {}) {
  const ids = ["f-organizer", "f-margin", "f-sponsor", "f-capacity"];
  const recalc = async () => {
    const data = await refreshBudget(panelEl);
    onRecalculate?.(data);
  };

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", recalc);
  });

  document.querySelectorAll(".artist-check").forEach((el) => {
    el.addEventListener("change", () => {
      el.closest(".artist-option")?.classList.toggle("selected", el.checked);
      recalc();
    });
  });

  return recalc;
}