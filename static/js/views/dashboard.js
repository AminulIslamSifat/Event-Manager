/**
 * Organiser dashboard — your events, drafts, and the publish flow.
 */

import { appRoot, del, get, post, store } from "../api.js";
import { navigate } from "../router.js";
import { confirmModal, toast } from "../ui.js";
import {
  emptyState, esc, formatDate, formatMoney, skeletonGrid, statusPill, val,
} from "../utils.js";

export async function renderDashboard() {
  if (!store.user?.logged_in) return navigate("login");

  appRoot.innerHTML = `
    <div class="view-head">
      <div class="eyebrow">Organiser</div>
      <h1 class="display">Your events</h1>
      <p class="sub">Create a production, track its budget, and publish when you are ready.</p>
    </div>
    <div id="my-events">${skeletonGrid(3)}</div>`;

  const box = document.getElementById("my-events");

  try {
    const data = await get("/api/events?mine=1&sort=newest");
    const events = data.events || [];

    if (!events.length) {
      box.innerHTML = emptyState({
        icon: "🎪",
        message: "You have not created an event yet.",
        actionLabel: "Create your first event",
        action: "navigate('createEvent')",
      });
      return;
    }

    box.innerHTML = events.map(eventRow).join("");
    wireRowActions();
  } catch {
    box.innerHTML = emptyState({ icon: "⚠️", message: "Could not load your events." });
  }
}

function eventRow(event) {
  const budget = event.budget || {};
  const draft = event.status !== "published";

  return `
    <div class="card list-row">
      <div class="info">
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.5rem">
          <strong>${esc(event.title)}</strong>
          ${statusPill(event.status)}
        </div>
        <div class="meta">
          <span class="tag">📅 ${formatDate(event.date)}</span>
          <span class="tag">📍 ${esc(event.location)}</span>
          <span class="tag">🎟️ ${event.tickets} left</span>
        </div>
        <p class="muted" style="font-size:0.8rem;margin-top:0.6rem">
          Net to recover <strong style="color:var(--gold)">${formatMoney(budget.net_expense || 0)}</strong>
          · base ticket ৳${budget.base_ticket_price ?? 0}
        </p>
      </div>
      <div class="actions">
        ${draft
          ? `<button class="primary" data-act="publish" data-id="${event.id}">Publish</button>`
          : `<button class="ghost" data-act="view" data-id="${event.id}">View</button>`}
        <button class="ghost" data-act="edit" data-id="${event.id}">Edit</button>
        <button class="danger" data-act="delete" data-id="${event.id}">Delete</button>
      </div>
    </div>`;
}

function wireRowActions() {
  document.querySelectorAll("#my-events button[data-act]").forEach((button) => {
    const id = Number(button.dataset.id);

    button.onclick = async () => {
      const act = button.dataset.act;

      if (act === "view")    return navigate("detail", id);
      if (act === "edit")    return navigate("editEvent", id);
      if (act === "publish") return navigate("publish", id);

      if (act === "delete") {
        const ok = await confirmModal(
          "Delete event",
          "This also removes every booking for it. This cannot be undone."
        );
        if (!ok) return;
        try {
          await del(`/api/events/${id}`);
          toast("Event deleted");
          renderDashboard();
        } catch (e) {
          toast(e.message, "error");
        }
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Publish — the platform-fee gate
// ---------------------------------------------------------------------------

export async function renderPublish(id) {
  if (!store.user?.logged_in) return navigate("login");

  let event;
  try {
    event = await get(`/api/events/${id}`);
  } catch {
    appRoot.innerHTML = emptyState({ icon: "🚫", message: "Event not found." });
    return;
  }

  if (event.status === "published") {
    appRoot.innerHTML = emptyState({
      icon: "✅",
      message: "This event is already live.",
      actionLabel: "View event",
      action: `navigate('detail',${id})`,
    });
    return;
  }

  const fee = 50000;

  appRoot.innerHTML = `
    <button class="back-btn" id="pub-back">← Back to dashboard</button>
    <div class="auth-wrap" style="margin-top:0">
      <h1 class="display" style="font-size:1.6rem">Publish your event</h1>
      <p class="sub">
        Pay the one-time platform fee to take <strong>${esc(event.title)}</strong> live.
        We handle hosting, ticketing and payment collection.
      </p>

      <div class="card">
        <div class="summary">
          <div class="summary-row"><span class="k">Event</span><span>${esc(event.title)}</span></div>
          <div class="summary-row"><span class="k">Base ticket price</span>
            <span>৳${event.budget?.base_ticket_price ?? 0}</span></div>
          <div class="summary-row total"><span>Platform fee</span>
            <span class="v">${formatMoney(fee)}</span></div>
        </div>

        <div class="pay-methods" id="pub-methods">
          <button class="active" data-method="card" id="pub-card">💳 Card</button>
          <button data-method="bkash" id="pub-bkash">📱 bKash</button>
        </div>

        <div id="err" class="error"></div>
        <input id="pub-card-number" placeholder="4242 4242 4242 4242" maxlength="19"
               value="4242424242424242">

        <button class="primary" id="publish-btn" style="width:100%;margin-top:0.5rem">
          Pay ${formatMoney(fee)} &amp; publish
        </button>

        <p class="muted" style="font-size:0.72rem;text-align:center;margin-top:1rem;line-height:1.6">
          Demo mode — no real charge. Cards ending 0000 are declined.
        </p>
      </div>
    </div>`;

  document.getElementById("pub-back").onclick = () => navigate("dashboard");

  let method = "card";
  const setMethod = (m) => {
    method = m;
    document.querySelectorAll("#pub-methods button").forEach((b) =>
      b.classList.toggle("active", b.dataset.method === m));
  };
  document.getElementById("pub-card").onclick = () => setMethod("card");
  document.getElementById("pub-bkash").onclick = () => setMethod("bkash");

  document.getElementById("publish-btn").onclick = async () => {
    const btn = document.getElementById("publish-btn");
    const errEl = document.getElementById("err");
    errEl.textContent = "";

    btn.disabled = true;
    btn.textContent = "Processing…";

    try {
      await post(`/api/events/${id}/publish`, {
        method,
        card_number: val("pub-card-number") || "5000000000000001",
      });
      toast("Event published — you are live!");
      navigate("detail", id);
    } catch (e) {
      errEl.textContent = e.message;
      btn.disabled = false;
      btn.textContent = `Pay ${formatMoney(fee)} & publish`;
    }
  };
}
