// small shared helpers

import { store } from "./api.js";

// escape before innerHTML. textContent trick, no regex bugs.
export function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// input value by id, "" if missing
export const val = (id) => document.getElementById(id)?.value ?? "";

// checkbox state by id
export const checked = (id) => Boolean(document.getElementById(id)?.checked);

// fire fn on enter inside #id
export function onEnter(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") fn(); });
}

// inline icon set. currentColor stroke on a 24x24 grid.
// this replaces the emoji that used to stand in for icons: emoji render as
// colour glyphs on linux/android but flat or missing-tofu elsewhere, and they
// can't inherit colour or line weight.
const ICONS = {
  search:     '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  warning:    '<path d="M12 9v4.5"/><path d="M12 17.2h.01"/><path d="M10.3 3.9 2.4 17.5a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  ban:        '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  inbox:      '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  ticket:     '<path d="M2 9.5A2.5 2.5 0 0 1 4.5 7h15A2.5 2.5 0 0 1 22 9.5v.9a2 2 0 0 0 0 3.2v.9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 14.5v-.9a2 2 0 0 0 0-3.2z"/><path d="M13 7.5v1.8M13 12.6v1.8M13 15.9v.6"/>',
  sparkles:   '<path d="M12 3.2l1.8 4.4 4.4 1.8-4.4 1.8L12 15.6l-1.8-4.4-4.4-1.8 4.4-1.8z"/><path d="M18.6 15.4l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  check:      '<path d="M20 6.5 9.2 17.3 4 12.1"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.4 2"/>',
  calendar:   '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 2.8v4M16 2.8v4"/>',
  pin:        '<path d="M20 10.2c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10.2" r="2.8"/>',
  mic:        '<rect x="9" y="2.2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/>',
  card:       '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  phone:      '<rect x="6" y="2" width="12" height="20" rx="2.8"/><path d="M10.8 18.2h2.4"/>',
  download:   '<path d="M12 3.5v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19.5h16"/>',
  chevronLeft:  '<path d="M15 18.5l-6.5-6.5L15 5.5"/>',
  chevronRight: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
};

// returns raw svg markup (never escaped -- it is our own string)
export function icon(name, size = 16) {
  const body = ICONS[name];
  if (!body) return "";
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" `
       + `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" `
       + `stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// formatting

// "2026-08-23T14:00" -> "Aug 23, 2026 · 2:00 PM"
export function formatDate(raw) {
  if (!raw) return "";
  const dt = new Date(String(raw).replace("T", " "));
  if (isNaN(dt)) return raw;
  const date = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

// ৳130 / ৳1.5L / ৳2.9Cr. lakh/crore so the budget panel stays readable.
export function formatMoney(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);

  if (abs >= 1_00_00_000) return `৳${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000)    return `৳${(n / 1_00_000).toFixed(2)}L`;
  return `৳${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// exact, thousands separators. detail rows use this one.
export function formatMoneyExact(amount) {
  return `৳${(Number(amount) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// price label, drops .00
export function priceLabel(price) {
  const n = Number(price) || 0;
  if (n <= 0) return { text: "Free", free: true };
  return { text: `৳${n.toFixed(n % 1 === 0 ? 0 : 2)}`, free: false };
}

// reusable markup

// loading placeholders
export function skeletonGrid(count = 6) {
  const cards = Array.from({ length: count }, () => `<div class="skeleton skeleton-card"></div>`).join("");
  return `<div class="grid">${cards}</div>`;
}

// stacked skeleton rows for list-style views (bookings, dashboard, tables)
export function skeletonRows(count = 3) {
  return Array.from({ length: count }, () => `<div class="skeleton skeleton-row"></div>`).join("");
}

// spinner markup. size in px, colour follows the text colour it sits in.
export function spinner(size = 16) {
  return `<span class="spinner" style="width:${size}px;height:${size}px"></span>`;
}

// centered loader for a whole panel / section
export function blockLoader(label = "Loading…") {
  return `<div class="block-loader">${spinner(22)}<span>${esc(label)}</span></div>`;
}

// flip a button into a busy state and back.
// keeps the original markup so restore is lossless.
export function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    if (button.dataset.idleHtml === undefined) button.dataset.idleHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-busy");
    button.innerHTML = `${spinner(13)}<span>${esc(busyLabel)}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("is-busy");
    if (button.dataset.idleHtml !== undefined) {
      button.innerHTML = button.dataset.idleHtml;
      delete button.dataset.idleHtml;
    }
  }
}

// empty state, optional button. `name` is a key from ICONS.
export function emptyState({ icon: name = "inbox", message, actionLabel = "", action = "" }) {
  const button = actionLabel
    ? `<button class="primary" onclick="${action}">${actionLabel}</button>`
    : "";
  return `
    <div class="empty-state">
      <div class="icon">${icon(name, 38)}</div>
      <p>${esc(message)}</p>
      ${button}
    </div>`;
}

// live/draft pill. the status dot is a css ::before so it inherits the
// pill's own colour -- it used to be a literal ● glyph.
export function statusPill(status) {
  return status === "published"
    ? `<span class="pill published">Live</span>`
    : `<span class="pill draft">Draft</span>`;
}

// is the current user an admin
export const isAdmin = () => store.user?.role === "admin";