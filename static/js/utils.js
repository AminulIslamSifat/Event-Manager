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

// formatting

const CATEGORY_ICONS = {
  Tech: "💻", Music: "🎵", Art: "🎨", Sports: "⚽",
  Food: "🍕", Education: "📚", General: "📌",
};

export const categoryIcon = (category) => CATEGORY_ICONS[category] || "📌";

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

// empty state, optional button
export function emptyState({ icon = "📭", message, actionLabel = "", action = "" }) {
  const button = actionLabel
    ? `<button class="primary" onclick="${action}">${actionLabel}</button>`
    : "";
  return `
    <div class="empty-state">
      <div class="icon">${icon}</div>
      <p>${esc(message)}</p>
      ${button}
    </div>`;
}

// live/draft pill
export function statusPill(status) {
  return status === "published"
    ? `<span class="pill published">● Live</span>`
    : `<span class="pill draft">● Draft</span>`;
}

// is the current user an admin
export const isAdmin = () => store.user?.role === "admin";