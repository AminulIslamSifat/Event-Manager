// live budget panel for the event form.
// just calls /api/events/quote -- the real calc happens server-side on save,
// this only exists so the organiser sees numbers move while typing.

import { post } from "../api.js";
import { esc, formatMoney, formatMoneyExact, val } from "../utils.js";
import { readTiers } from "./tierEditor.js";

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
  // the pool and the price both come from the tier list -- there is no
  // standalone price or ticket-count field any more.
  const tiers = readTiers();
  const tickets = tiers.reduce((sum, t) => sum + t.quantity, 0);
  const price = tiers.length ? Math.min(...tiers.map((t) => t.price)) : 0;

  return {
    venue_fee: Number(val("f-venue-fee")) || 0,
    venue_capacity: Number(val("f-capacity")) || 0,
    tickets,
    price,
    // the server sums price x seats per tier, so revenue reflects the real
    // mix instead of assuming every seat sells at the cheapest price
    tiers: tiers.map((t) => ({ price: t.price, quantity: t.quantity })),
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
    ${row("Your margin", b.admin_margin, "sub")}

    <hr class="budget-divider">
    ${row("Total expenses", b.total_expenses, "total")}

    ${b.sponsorship > 0 ? row("Less sponsorship", -b.sponsorship, "sub") : ""}

    <hr class="budget-divider">
    <div class="budget-row total">
      <span>Net to recover</span>
      <span class="amount">${formatMoneyExact(b.net_expense)}</span>
    </div>

    <div class="budget-result">
      <div class="label">Price to break even</div>
      <div class="value">${b.ticket_pool > 0 ? formatMoneyExact(b.base_ticket_price) : "—"}</div>
      <div class="hint">
        ${b.ticket_pool > 0
          ? `${formatMoney(b.net_expense)} ÷ ${b.ticket_pool.toLocaleString("en-IN")} seats`
          : "Add a tier with seats to set the pool"}
      </div>
      ${b.break_even_tickets > 0
        ? `<div class="hint" style="margin-top:0.35rem">
             At ৳${b.ticket_price.toLocaleString("en-IN")} you need ${b.break_even_tickets.toLocaleString("en-IN")} sold
           </div>`
        : ""}
    </div>
    ${projectionBlock(b)}`;
}

// the sell-out projection: revenue, profit, and the ratios that make it
// readable. this is the number that actually answers "should I run this".
function projectionBlock(b) {
  if (!b.ticket_pool) {
    return `<div class="budget-projection empty">
              <div class="label">If you sell out</div>
              <div class="value">—</div>
              <div class="hint">Add a tier with seats</div>
            </div>`;
  }

  const profitable = b.profit >= 0;
  const sign = profitable ? "+" : "−";
  const abs = Math.abs(b.profit);

  const stat = (label, value) =>
    `<div class="proj-stat"><span class="k">${label}</span><span class="v">${value}</span></div>`;

  return `
    <div class="budget-projection ${profitable ? "good" : "bad"}">
      <div class="label">If you sell out</div>
      <div class="value">${sign}${formatMoneyExact(abs)}</div>
      <div class="caption">${profitable ? "profit" : "loss"}</div>

      <div class="proj-stats">
        ${stat("Revenue", formatMoney(b.projected_revenue))}
        ${stat("Costs", formatMoney(b.net_expense))}
        ${stat("Avg ticket", formatMoneyExact(b.avg_ticket_price))}
        ${stat("Return", `${b.roi_pct > 0 ? "+" : ""}${b.roi_pct}%`)}
      </div>
    </div>

    ${!profitable
      ? `<div class="budget-warning">
           <strong>Selling out still leaves ${formatMoney(b.shortfall)} uncovered.</strong>
           <span>You need ${formatMoneyExact(b.base_ticket_price)} per seat.
           ${b.break_even_tickets > b.ticket_pool
             // don't imply a number that cannot physically be sold
             ? `At today's prices you'd have to sell ${b.break_even_tickets.toLocaleString("en-IN")}, but only ${b.ticket_pool.toLocaleString("en-IN")} seats are on sale.`
             : `Or sell ${b.break_even_tickets.toLocaleString("en-IN")} at today's prices.`}</span>
         </div>`
      : ""}`;
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
  // the tier editor drives price + pool, so those are wired by the form.
  // capacity matters because it caps the pool.
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