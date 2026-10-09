// bookings list, checkout, payment, confirmation

import { appRoot, del, get, post, store } from "../api.js";
import { navigate } from "../router.js";
import { confirmModal, toast } from "../ui.js";
import { emptyState, esc, formatDate, formatMoneyExact, icon, setBusy, skeletonRows, val } from "../utils.js";


export async function renderBookings() {
  if (!store.user?.logged_in) return navigate("login");

  appRoot.innerHTML = `
    <div class="view-head">
      <div class="eyebrow">Your tickets</div>
      <h1 class="display">My bookings</h1>
    </div>
    <div id="bookings-list">${skeletonRows(3)}</div>`;

  const list = document.getElementById("bookings-list");

  try {
    const bookings = await get("/api/bookings");

    if (!bookings.length) {
      list.innerHTML = emptyState({
        icon: "ticket",
        message: "You haven't booked anything yet.",
        actionLabel: "Browse events",
        action: "navigate('events')",
      });
      return;
    }

    list.innerHTML = bookings.map(bookingRow).join("");
  } catch {
    list.innerHTML = emptyState({ icon: "warning", message: "Couldn't load your bookings." });
  }
}

function bookingRow(b) {
  const pending = b.status === "pending_payment";
  const statusTag = pending
    ? `<span class="tag gold">${icon("clock", 13)} Pending payment</span>`
    : `<span class="tag success">${icon("check", 13)} Confirmed</span>`;

  const tierTag = b.tier_name ? `<span class="tag">${esc(b.tier_name)}</span>` : "";

  // data attributes, keeps this out of inline onclick escaping hell
  const action = pending
    ? `<button class="primary" data-act="resume"
         data-booking='${esc(JSON.stringify({
           id: b.id, title: b.title, quantity: b.quantity,
           price: b.price, event_id: b.event_id,
         }))}'>Pay now</button>`
    : `<button class="danger" data-act="cancel" data-id="${b.id}">Cancel</button>`;

  return `
    <div class="card list-row">
      <div class="info">
        <h3 style="margin-bottom:0.5rem">${esc(b.title)}</h3>
        <div class="meta">
          <span class="tag">${icon("calendar", 13)} ${formatDate(b.date)}</span>
          <span class="tag">${icon("pin", 13)} ${esc(b.location)}</span>
          ${tierTag}
          ${statusTag}
        </div>
        <p class="muted" style="font-size:0.82rem;margin-top:0.6rem">
          ${b.quantity} ticket${b.quantity > 1 ? "s" : ""} ·
          <strong style="color:var(--text)">${formatMoneyExact(b.price * b.quantity)}</strong>
        </p>
      </div>
      <div class="actions">${action}</div>
    </div>`;
}

// delegated handler for the buttons above
export async function onBookingAction(clickEvent) {
  const button = clickEvent.target.closest("button[data-act]");
  if (!button) return;

  if (button.dataset.act === "cancel") {
    const ok = await confirmModal("Cancel booking", "Your tickets will be released back to the event.");
    if (!ok) return;
    setBusy(button, true, "Cancelling…");
    try {
      await del(`/api/bookings/${button.dataset.id}`);
      toast("Booking cancelled");
      renderBookings();
    } catch (e) {
      setBusy(button, false);
      toast(e.message, "error");
    }
  }

  if (button.dataset.act === "resume") {
    const info = JSON.parse(button.dataset.booking);
    store.lastBooking = {
      booking_id: info.id,
      title: info.title,
      quantity: info.quantity,
      total: info.price * info.quantity,
      free: false,
      event_id: info.event_id,
    };
    navigate("payment");
  }
}


function cardFields() {
  return `
    <input id="p-card" placeholder="4242 4242 4242 4242" maxlength="19"
           oninput="formatCard(this)" autocomplete="cc-number">
    <div style="display:flex;gap:0.6rem">
      <input id="p-exp" placeholder="MM/YY" maxlength="5" oninput="formatExpiry(this)" autocomplete="cc-exp">
      <input id="p-cvv" placeholder="CVV" maxlength="4" type="password" autocomplete="cc-csc">
    </div>
    <input id="p-name" placeholder="Name on card" autocomplete="cc-name">`;
}

function mobileFields(method) {
  const label = method === "bkash" ? "bKash" : "Nagad";
  return `
    <input id="p-mobile" placeholder="01XXXXXXXXX" maxlength="11" inputmode="numeric">
    <p class="muted" style="font-size:0.75rem;margin-top:-0.4rem">
      Enter your ${label} number — a demo OTP is simulated.
    </p>`;
}

export function renderPayment() {
  if (!store.lastBooking || store.lastBooking.free) return navigate("events");
  const b = store.lastBooking;

  appRoot.innerHTML = `
    <button class="back-btn" id="checkout-back">${icon("chevronLeft", 15)} Back</button>
    <div class="auth-wrap" style="margin-top:0">
      <h1 class="display" style="font-size:1.6rem">Checkout</h1>
      <p class="sub">Complete payment to confirm your tickets.</p>

      <div class="card">
        <div class="summary">
          <div class="summary-row"><span class="k">Event</span><span>${esc(b.title)}</span></div>
          <div class="summary-row"><span class="k">Tickets</span><span>${b.quantity}</span></div>
          <div class="summary-row total"><span>Total</span><span class="v">${formatMoneyExact(b.total)}</span></div>
        </div>

        <div class="pay-methods" id="pay-methods">
          <button class="active" data-method="card"  id="pm-card">${icon("card", 15)} Card</button>
          <button data-method="bkash" id="pm-bkash">${icon("phone", 15)} bKash</button>
          <button data-method="nagad" id="pm-nagad">${icon("phone", 15)} Nagad</button>
        </div>

        <div id="err" class="error"></div>
        <div id="pay-fields">${cardFields()}</div>

        <button class="primary" id="pay-btn" style="width:100%;margin-top:0.5rem">
          Pay ${formatMoneyExact(b.total)}
        </button>

        <p class="muted" style="font-size:0.72rem;text-align:center;margin-top:1rem;line-height:1.6">
          Demo mode — no real charges.<br>
          Visa starts with 4, Mastercard with 5. Cards ending 0000 are declined.
        </p>
      </div>
    </div>`;

  document.getElementById("checkout-back").onclick = goBackFromCheckout;
  document.getElementById("pm-card").onclick  = () => selectPayMethod("card");
  document.getElementById("pm-bkash").onclick = () => selectPayMethod("bkash");
  document.getElementById("pm-nagad").onclick = () => selectPayMethod("nagad");
  document.getElementById("pay-btn").onclick  = processPayment;
}

let payMethod = "card";

function selectPayMethod(method) {
  payMethod = method;
  document.querySelectorAll("#pay-methods button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.method === method);
  });
  document.getElementById("pay-fields").innerHTML =
    method === "card" ? cardFields() : mobileFields(method);
}

export function goBackFromCheckout() {
  if (store.lastBooking?.event_id) navigate("detail", store.lastBooking.event_id);
  else navigate("events");
}

export function formatCard(input) {
  const digits = input.value.replace(/\D/g, "").slice(0, 16);
  input.value = digits.replace(/(.{4})/g, "$1 ").trim();
}

export function formatExpiry(input) {
  let digits = input.value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) digits = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  input.value = digits;
}

async function processPayment() {
  const btn = document.getElementById("pay-btn");
  const errEl = document.getElementById("err");
  errEl.textContent = "";

  const payload = { booking_id: store.lastBooking.booking_id, method: payMethod };

  if (payMethod === "card") {
    payload.card_number = val("p-card");
    if (!payload.card_number.replace(/\s/g, "")) {
      errEl.textContent = "Enter your card number";
      return;
    }
  } else {
    payload.card_number = "5000000000000001";   // placeholder for mobile wallets
    if (val("p-mobile").length < 11) {
      errEl.textContent = "Enter a valid mobile number";
      return;
    }
  }

  setBusy(btn, true, "Processing…");
  await new Promise((r) => setTimeout(r, 1500));

  try {
    const result = await post("/api/pay", payload);
    store.lastBooking.transaction_id = result.transaction_id;
    store.lastBooking.payment_method = result.method;
    navigate("bookingConfirm");
  } catch (e) {
    setBusy(btn, false);
    errEl.textContent = e.message;
  }
}


export function renderBookingConfirm() {
  if (!store.lastBooking) return navigate("events");
  const b = store.lastBooking;

  const rows = [
    `<div class="summary-row"><span class="k">Tickets</span><span>${b.quantity}</span></div>`,
    `<div class="summary-row"><span class="k">Total paid</span>
       <span style="color:var(--gold);font-weight:600">${formatMoneyExact(b.total)}</span></div>`,
  ];
  if (b.transaction_id) {
    rows.push(`<div class="summary-row"><span class="k">Transaction</span>
      <span class="muted" style="font-family:monospace;font-size:0.75rem">${esc(b.transaction_id)}</span></div>`);
  }
  if (b.payment_method) {
    rows.push(`<div class="summary-row"><span class="k">Method</span>
      <span>${esc(b.payment_method).toUpperCase()}</span></div>`);
  }

  appRoot.innerHTML = `
    <div class="card confirm-box" style="max-width:480px;margin:2rem auto">
      <div class="confirm-check">${icon("check", 26)}</div>
      <h2 class="display">You're in!</h2>
      <p class="muted" style="margin-bottom:1.5rem">${esc(b.title)}</p>
      <div class="summary" style="text-align:left">${rows.join("")}</div>
      <p class="muted" style="font-size:0.75rem;margin-bottom:1.5rem">Booking #${b.booking_id}</p>
      <div style="display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap">
        <button class="ghost" id="to-bookings">My tickets</button>
        <button class="primary" id="to-events">Browse more</button>
      </div>
    </div>`;

  document.getElementById("to-bookings").onclick = () => navigate("bookings");
  document.getElementById("to-events").onclick = () => navigate("events");
}