/**
 * Toast notifications and the confirm modal.
 *
 * Both are imperative helpers — call them, get a result, no state to manage.
 */

import { esc } from "./utils.js";

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export function toast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add("fade-out");
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

/**
 * Show a yes/no modal.
 * @returns {Promise<boolean>} true when confirmed.
 */
export function confirmModal(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="ghost" data-act="cancel">Cancel</button>
          <button class="danger" data-act="confirm">Confirm</button>
        </div>
      </div>`;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('[data-act="cancel"]').onclick = () => close(false);
    overlay.querySelector('[data-act="confirm"]').onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };

    document.body.appendChild(overlay);
  });
}