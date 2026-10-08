/**
 * Dynamic ticket-tier editor (e.g. VIP / Regular / Student).
 */

import { esc } from "../utils.js";

/** One editable tier row. */
function tierRow(tier = {}) {
  return `
    <div class="tier-row">
      <input class="tier-name" placeholder="Tier name (e.g. VIP)" value="${esc(tier.name || "")}">
      <input class="tier-price" type="number" min="0" step="0.01" placeholder="Price" value="${tier.price ?? ""}">
      <input class="tier-qty" type="number" min="0" placeholder="Qty" value="${tier.quantity ?? ""}">
      <button type="button" class="tier-remove" title="Remove tier">×</button>
    </div>`;
}

/** The editor container plus an "Add tier" button. */
export function tierEditorHtml(tiers = []) {
  const rows = tiers.length ? tiers.map(tierRow).join("") : "";
  return `
    <div id="tier-editor">${rows}</div>
    <button type="button" class="ghost" id="tier-add" style="width:100%;margin-top:0.35rem">
      + Add tier
    </button>`;
}

/** Read the current tier rows back out of the DOM. */
export function readTiers() {
  return [...document.querySelectorAll("#tier-editor .tier-row")]
    .map((row) => ({
      name: row.querySelector(".tier-name").value.trim(),
      price: Number(row.querySelector(".tier-price").value) || 0,
      quantity: Number(row.querySelector(".tier-qty").value) || 0,
    }))
    .filter((tier) => tier.name);   // ignore half-filled rows
}

/** Wire add/remove behaviour. */
export function wireTierEditor() {
  const editor = document.getElementById("tier-editor");
  const addButton = document.getElementById("tier-add");
  if (!editor || !addButton) return;

  addButton.addEventListener("click", () => {
    editor.insertAdjacentHTML("beforeend", tierRow());
  });

  // Delegated: works for rows added later too.
  editor.addEventListener("click", (e) => {
    if (e.target.classList.contains("tier-remove")) {
      e.target.closest(".tier-row")?.remove();
    }
  });
}