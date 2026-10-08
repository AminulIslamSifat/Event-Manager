// searchable multi-select artist picker

import { store } from "../api.js";
import { esc, formatMoney } from "../utils.js";

// selectedIds pre-ticks an existing lineup
export function artistPickerHtml(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));

  const options = store.artists.map((artist) => {
    const isOn = selected.has(artist.id);
    return `
      <label class="artist-option ${isOn ? "selected" : ""}" data-name="${esc(artist.name.toLowerCase())}">
        <input type="checkbox" class="artist-check"
               value="${artist.id}" data-fee="${artist.fee}"
               ${isOn ? "checked" : ""}>
        <span class="name">${esc(artist.name)}</span>
        <span class="fee">${formatMoney(artist.fee)}</span>
      </label>`;
  }).join("");

  return `
    <div class="picker-toolbar">
      <input type="search" id="artist-search" placeholder="Filter artists…" style="flex:1">
      <button type="button" class="ghost" id="artist-clear" style="padding:0.35rem 0.7rem;font-size:0.75rem">
        Clear
      </button>
    </div>
    <div class="artist-picker" id="artist-picker">${options}</div>`;
}

// filter box + clear button
export function wireArtistPicker() {
  const search = document.getElementById("artist-search");
  const picker = document.getElementById("artist-picker");
  const clear = document.getElementById("artist-clear");

  if (search && picker) {
    search.addEventListener("input", () => {
      const term = search.value.trim().toLowerCase();
      picker.querySelectorAll(".artist-option").forEach((el) => {
        el.style.display = el.dataset.name.includes(term) ? "" : "none";
      });
    });
  }

  if (clear) {
    clear.addEventListener("click", () => {
      picker.querySelectorAll(".artist-check").forEach((el) => {
        el.checked = false;
        el.closest(".artist-option")?.classList.remove("selected");
      });
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
}