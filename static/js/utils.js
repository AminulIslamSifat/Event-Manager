/**
 * Small shared helpers used across every view.
 */

import { store } from "./api.js";

/** Escape untrusted text before putting it inside innerHTML. */
export function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

/** Read an input's value by id ("" when the element is missing). */
export const val = (id) => document.getElementById(id)?.value ?? "";

/** Read a checkbox's checked state by id. */
export const checked = (id) => Boolean(document.getElementById(id)?.checked);

/** Run `fn` when Enter is pressed inside the element with `id`. */
export function onEnter(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") fn(); });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const CATEGORY_ICONS = {
  Tech: "💻", Music: "🎵", Art: "🎨", Sports: "⚽",
  Food: "🍕", Education: "📚", General: "📌",
};

export const categoryIcon = (category) => CATEGORY_ICONS[category] || "📌";

/** "2026-08-23T14:00" -> "Aug 23, 2026 · 2:00 PM" */
export function formatDate(raw) {
  if (!raw) return "";
  const dt = new Date(String(raw).replace("T", " "));
  if (isNaN(dt)) return raw;
  const date = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

/** Compact money: ৳130, ৳1.5L, ৳2.9Cr — keeps the budget panel readable. */
export function formatMoney(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);

  if (abs >= 1_00_00_000) return `৳${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000)    return `৳${(n / 1_00_000).toFixed(2)}L`;
  return `৳${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Exact money with thousands separators, for detail rows. */
export function formatMoneyExact(amount) {
  return `৳${(Number(amount) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Ticket price with sensible decimals. */
export function priceLabel(price) {
  const n = Number(price) || 0;
  if (n <= 0) return { text: "Free", free: true };
  return { text: `৳${n.toFixed(n % 1 === 0 ? 0 : 2)}`, free: false };
}

// ---------------------------------------------------------------------------
// Reusable markup fragments
// ---------------------------------------------------------------------------

/** Shimmering placeholder cards shown while data loads. */
export function skeletonGrid(count = 6) {
  const cards = Array.from({ length: count }, () => `<div class="skeleton skeleton-card"></div>`).join("");
  return `<div class="grid">${cards}</div>`;
}

/** Centered empty state with an optional call-to-action button. */
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

/** Status pill for an event's publish state. */
export function statusPill(status) {
  return status === "published"
    ? `<span class="pill published">● Live</span>`
    : `<span class="pill draft">● Draft</span>`;
}

/** True when the current user is an admin. */
export const isAdmin = () => store.user?.role === "admin";