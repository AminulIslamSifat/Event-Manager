// ticket tiers.
//
// every ticket belongs to a tier -- there is no separate "base price" field.
// this is the only place a price is set, and the quantities are ALLOCATIONS
// of the venue's fixed capacity, not independent seat counts.

import { esc } from "../utils.js";

// one tier row. name | price | seats | remove
export function tierRow(tier = {}) {
  return `
    <div class="tier-row">
      <input class="tier-name" placeholder="e.g. Regular" value="${esc(tier.name || "")}">
      <input class="tier-price" type="number" min="0" step="1" placeholder="Price" value="${tier.price ?? ""}">
      <input class="tier-qty" type="number" min="0" step="1" placeholder="Seats" value="${tier.quantity ?? ""}">
      <button type="button" class="tier-remove" title="Remove tier">×</button>
    </div>`;
}

// header + rows + the allocation meter
export function tierEditorHtml(tiers = []) {
  const rows = tiers.length ? tiers.map(tierRow).join("") : "";
  return `
    <div class="tier-head">
      <span>Tier</span><span>Price (৳)</span><span>Seats</span><span></span>
    </div>
    <div id="tier-editor">${rows}</div>
    <button type="button" class="ghost" id="tier-add" style="width:100%;margin-top:0.35rem">
      + Add tier
    </button>
    <div id="tier-meter" class="tier-meter"></div>`;
}

// read the rows back out of the DOM
export function readTiers() {
  return [...document.querySelectorAll("#tier-editor .tier-row")]
    .map((row) => ({
      name: row.querySelector(".tier-name").value.trim(),
      price: Number(row.querySelector(".tier-price").value) || 0,
      quantity: Number(row.querySelector(".tier-qty").value) || 0,
    }))
    .filter((tier) => tier.name);   // skip half-filled rows
}

// total seats handed out across every tier
export function allocatedSeats() {
  return [...document.querySelectorAll("#tier-editor .tier-qty")]
    .reduce((sum, el) => sum + (Number(el.value) || 0), 0);
}

// repaint the allocation meter against the venue capacity
// (the meter is informational; the server enforces the real limit)
export function updateTierMeter(capacity) {
  const el = document.getElementById("tier-meter");
  if (!el) return;

  const cap = Number(capacity) || 0;
  const allocated = allocatedSeats();

  if (!cap) {
    el.innerHTML = `<span class="tier-meter-text muted">Pick a venue to set the seat count.</span>`;
    return;
  }

  const left = cap - allocated;
  const pct = Math.min(100, (allocated / cap) * 100);
  const state = left === 0 ? "ok" : (left < 0 ? "over" : "under");
  const n = (v) => v.toLocaleString("en-IN");

  el.innerHTML = `
    <span class="tier-meter-bar"><i class="${state}" style="width:${pct}%"></i></span>
    <span class="tier-meter-text ${state}">
      ${n(allocated)} / ${n(cap)} seats allocated
      ${left === 0
        ? ""
        : left > 0
          ? `· ${n(left)} unassigned`
          : `· ${n(Math.abs(left))} over capacity`}
    </span>`;
}

// add/remove + notify on any change so the meter and budget stay live
export function wireTierEditor({ onAllocationChange } = {}) {
  const editor = document.getElementById("tier-editor");
  const addButton = document.getElementById("tier-add");
  if (!editor || !addButton) return;

  addButton.addEventListener("click", () => {
    editor.insertAdjacentHTML("beforeend", tierRow());
    onAllocationChange?.();
  });

  // delegated input, so it works on rows added later
  editor.addEventListener("input", () => onAllocationChange?.());

  editor.addEventListener("click", (e) => {
    if (e.target.classList.contains("tier-remove")) {
      e.target.closest(".tier-row")?.remove();
      onAllocationChange?.();
    }
  });
}
