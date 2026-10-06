/* ============================================================
   EVENT KHUJO — Frontend
   Single-page app. No build step, plain ES2020.
   Structure:
     1. State          6. Modal
     2. API layer      7. Navigation
     3. DOM helpers    8. Nav bar
     4. Utilities      9. Auth pages
     5. Toast         10. Views
   ============================================================ */

/* ---------- 1. State ---------- */

let currentUser = null;      // { id, username, role, logged_in } | null
let csrfToken   = "";
let currentView = "events";
let viewParam   = null;
let lastBooking = null;      // carries data between book -> pay -> confirm

// Events-list filters
let searchQuery    = "";
let filterCategory = "All";
let sortBy         = "date_asc";
let currentPage    = 1;

// Payment form state
let payMethod = "card";

const app      = document.getElementById("app");
const navLinks = document.getElementById("nav-links");

/* ---------- 2. API layer ---------- */

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken,
    ...(options.headers || {}),
  };
  const res  = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

async function loadCsrfToken() {
  const res = await fetch("/api/csrf");
  csrfToken = (await res.json()).token;
}

/* ---------- 3. DOM helpers ---------- */

/** Get an element's value by id ("" when missing). */
const val = (id) => document.getElementById(id)?.value ?? "";

/** Run `fn` when Enter is pressed inside `id`. */
function onEnter(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") fn(); });
}

/* ---------- 4. Utilities ---------- */

/** Escape untrusted text before injecting into innerHTML. */
function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

const CATEGORY_ICONS = {
  Tech: "💻", Music: "🎵", Art: "🎨", Sports: "⚽",
  Food: "🍕", Education: "📚", General: "📌",
};

const categoryIcon = (category) => CATEGORY_ICONS[category] || "📌";

/** "2026-08-23T14:00" -> "Aug 23, 2026 · 2:00 PM" */
function formatDate(raw) {
  if (!raw) return "";
  const dt = new Date(String(raw).replace("T", " "));
  if (isNaN(dt)) return raw;
  const date = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

/** Returns { text, free } so callers can style free events differently. */
function priceLabel(price) {
  const n = Number(price) || 0;
  if (n <= 0) return { text: "Free", free: true };
  return { text: `৳${n.toFixed(n % 1 === 0 ? 0 : 2)}`, free: false };
}

/** A grid of shimmering placeholder cards shown while data loads. */
function skeletonGrid(count = 6) {
  const cards = Array.from({ length: count }, () => `<div class="skeleton skeleton-card"></div>`).join("");
  return `<div class="grid">${cards}</div>`;
}

/* ---------- 5. Toast ---------- */

function toast(message, type = "success") {
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

/* ---------- 6. Modal ---------- */

function confirmModal(title, message) {
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

    const close = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('[data-act="cancel"]').onclick  = () => close(false);
    overlay.querySelector('[data-act="confirm"]').onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    document.body.appendChild(overlay);
  });
}

/* ---------- 7. Navigation ---------- */

const VIEWS = {
  events:         renderEvents,
  detail:         renderDetail,
  login:          renderLogin,
  register:       renderRegister,
  bookings:       renderBookings,
  profile:        renderProfile,
  admin:          renderAdmin,
  createEvent:    renderCreateEvent,
  editEvent:      renderEditEvent,
  payment:        renderPayment,
  bookingConfirm: renderBookingConfirm,
};

function navigate(view, param) {
  currentView = view;
  viewParam   = param;
  const hash = `#${view}${param !== undefined ? "/" + param : ""}`;
  history.pushState({ view, param }, "", hash);
  render();
}

function readHash() {
  const parts = (location.hash.slice(1) || "events").split("/");
  currentView = parts[0] || "events";
  const raw   = parts[1];
  viewParam   = raw === undefined ? null : (isNaN(raw) ? raw : parseInt(raw, 10));
}

function render() {
  window.scrollTo({ top: 0 });
  (VIEWS[currentView] || renderEvents)(viewParam);
}

window.addEventListener("popstate", (e) => {
  if (e.state) { currentView = e.state.view; viewParam = e.state.param; render(); }
  else { readHash(); render(); }
});

/* ---------- 8. Nav bar ---------- */

function updateNav() {
  navLinks.innerHTML = "";
  const loggedIn = Boolean(currentUser?.logged_in);

  const addButton = (label, onClick, className = "") => {
    const button = document.createElement("button");
    button.textContent = label;
    if (className) button.className = className;
    button.onclick = onClick;
    navLinks.appendChild(button);
  };

  // 1 — Find Event: jump to the list and focus the search box
  addButton("Find Event", () => {
    if (currentView !== "events") navigate("events");
    document.getElementById("nav-search").focus();
  });

  // 2 — Create Event (backend requires admin)
  addButton("Create Event", () => {
    if (!loggedIn)              return navigate("login");
    if (currentUser.role !== "admin") return toast("Admin access required", "error");
    navigate("createEvent");
  }, "accent");

  // 3 — My Tickets (always visible; the view redirects if logged out)
  addButton("My Tickets", () => navigate("bookings"));

  // 4 & 5 — Auth area
  if (loggedIn) {
    addButton(currentUser.username, () => navigate("profile"), "user");
    addButton("Logout", async () => {
      await api("/api/logout", { method: "POST" });
      currentUser = null;
      updateNav();
      navigate("events");
    });
  } else {
    addButton("Login", () => navigate("login"));
    addButton("Sign Up", () => navigate("register"));
  }
}

/* ---------- 9. Header search (global) ---------- */

let searchTimer;

function setupHeaderSearch() {
  const input = document.getElementById("nav-search");

  const apply = () => {
    searchQuery = input.value;
    currentPage = 1;
    if (currentView !== "events") navigate("events");
    else loadEvents();
  };

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(apply, 300);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { clearTimeout(searchTimer); apply(); }
    if (e.key === "Escape") { input.value = ""; input.blur(); }
  });
}

function clearSearch() {
  searchQuery = "";
  const input = document.getElementById("nav-search");
  if (input) input.value = "";
}

/* ---------- 10. Auth ---------- */

async function checkAuth() {
  await loadCsrfToken();
  try {
    currentUser = await api("/api/me");
    if (!currentUser.logged_in) currentUser = null;
  } catch {
    currentUser = null;
  }
  updateNav();
  readHash();
  render();
}

function renderLogin() {
  app.innerHTML = `
    <div class="auth-wrap">
      <h1 class="display">Welcome back</h1>
      <p class="sub">Sign in to book tickets and manage your events.</p>
      <div class="card">
        <div id="err" class="error"></div>
        <label class="field-label" for="u">Username</label>
        <input id="u" placeholder="your username" autocomplete="username">
        <label class="field-label" for="p">Password</label>
        <input id="p" type="password" placeholder="••••••••" autocomplete="current-password">
        <button class="primary" style="width:100%;margin-top:0.5rem" onclick="doLogin()">Sign in</button>
        <p class="form-links">No account? <a onclick="navigate('register')">Create one</a></p>
      </div>
    </div>`;
  onEnter("u", doLogin);
  onEnter("p", doLogin);
}

async function doLogin() {
  const username = val("u").trim();
  const password = val("p");
  if (!username || !password) return void (document.getElementById("err").textContent = "Fill in both fields");

  try {
    currentUser = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    currentUser.logged_in = true;
    updateNav();
    toast(`Welcome back, ${currentUser.username}`);
    navigate("events");
  } catch (e) {
    document.getElementById("err").textContent = e.message;
  }
}

function renderRegister() {
  app.innerHTML = `
    <div class="auth-wrap">
      <h1 class="display">Create your account</h1>
      <p class="sub">Join Event Khujo to book tickets in seconds.</p>
      <div class="card">
        <div id="err" class="error"></div>
        <label class="field-label" for="u">Username</label>
        <input id="u" placeholder="at least 3 characters" autocomplete="username">
        <label class="field-label" for="p">Password</label>
        <input id="p" type="password" placeholder="at least 4 characters" autocomplete="new-password">
        <button class="primary" style="width:100%;margin-top:0.5rem" onclick="doRegister()">Create account</button>
        <p class="form-links">Already registered? <a onclick="navigate('login')">Sign in</a></p>
      </div>
    </div>`;
  onEnter("u", doRegister);
  onEnter("p", doRegister);
}

async function doRegister() {
  const username = val("u").trim();
  const password = val("p");
  if (!username || !password) return void (document.getElementById("err").textContent = "Fill in both fields");

  try {
    await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    toast("Account created — please sign in");
    navigate("login");
  } catch (e) {
    document.getElementById("err").textContent = e.message;
  }
}

/* ---------- 11. Events list ---------- */

function eventCard(event) {
  const { text, free } = priceLabel(event.price);
  const thumb = event.image_url
    ? `<img src="${esc(event.image_url)}" alt="" onerror="this.remove()">`
    : `<span class="thumb-emoji">${categoryIcon(event.category)}</span>`;

  return `
    <article class="card event-card" onclick="navigate('detail',${event.id})">
      <div class="event-thumb">${thumb}</div>
      <div class="event-body">
        <h3>${esc(event.title)}</h3>
        <div class="meta">
          <span class="tag">${formatDate(event.date)}</span>
          <span class="tag">${esc(event.category || "General")}</span>
        </div>
        <div class="meta"><span class="tag">📍 ${esc(event.location)}</span></div>
        <div class="event-foot">
          <span class="price${free ? " free" : ""}">${text}</span>
          <span class="tickets-left">${event.tickets} left</span>
        </div>
      </div>
    </article>`;
}

async function renderEvents() {
  const headerSearch = document.getElementById("nav-search");
  if (headerSearch && headerSearch.value !== searchQuery) headerSearch.value = searchQuery;

  app.innerHTML = `
    <div class="view-head">
      <div class="eyebrow">Discover</div>
      <h1 class="display">Find your next event</h1>
    </div>
    <div class="toolbar">
      <select id="cat-filter" onchange="filterCategory=this.value;currentPage=1;renderEvents()">
        <option value="All">All categories</option>
      </select>
      <select id="sort" onchange="sortBy=this.value;currentPage=1;renderEvents()">
        <option value="date_asc"  ${sortBy === "date_asc"  ? "selected" : ""}>Date · soonest</option>
        <option value="date_desc" ${sortBy === "date_desc" ? "selected" : ""}>Date · latest</option>
        <option value="price_asc" ${sortBy === "price_asc" ? "selected" : ""}>Price · low to high</option>
        <option value="price_desc"${sortBy === "price_desc" ? "selected" : ""}>Price · high to low</option>
      </select>
    </div>
    <div id="events-grid">${skeletonGrid(6)}</div>
    <div id="pagination" class="pagination"></div>`;

  loadEvents();
}

async function loadEvents() {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  grid.innerHTML = skeletonGrid(6);

  try {
    const params = new URLSearchParams({
      q: searchQuery,
      category: filterCategory,
      sort: sortBy,
      page: currentPage,
      upcoming: "1",
    });
    const data = await api(`/api/events?${params}`);

    syncCategoryFilter(data.categories);

    if (!data.events.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <p>No events match your search.</p>
          <button class="ghost" onclick="clearSearch();filterCategory='All';currentPage=1;renderEvents()">Clear filters</button>
        </div>`;
      document.getElementById("pagination").innerHTML = "";
      return;
    }

    grid.innerHTML = `<div class="grid">${data.events.map(eventCard).join("")}</div>`;
    renderPagination(data.pages);
  } catch {
    grid.innerHTML = `<div class="empty-state"><p>Couldn't load events. Try again.</p></div>`;
  }
}

function syncCategoryFilter(categories = []) {
  const select = document.getElementById("cat-filter");
  if (!select) return;
  select.innerHTML =
    `<option value="All">All categories</option>` +
    categories.map((c) => `<option value="${esc(c)}" ${c === filterCategory ? "selected" : ""}>${esc(c)}</option>`).join("");
}

function renderPagination(totalPages) {
  const box = document.getElementById("pagination");
  if (totalPages <= 1) return void (box.innerHTML = "");

  const pageButton = (label, page, { active = false, disabled = false } = {}) =>
    `<button ${disabled ? "disabled" : ""} class="${active ? "active" : ""}"
       onclick="goToPage(${page})">${label}</button>`;

  const parts = [pageButton("←", currentPage - 1, { disabled: currentPage <= 1 })];

  for (let i = 1; i <= totalPages; i++) {
    // Collapse far-away pages into an ellipsis
    const far = totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages;
    if (far) {
      if (i === 2 || i === totalPages - 1) parts.push(`<button disabled>…</button>`);
      continue;
    }
    parts.push(pageButton(i, i, { active: i === currentPage }));
  }

  parts.push(pageButton("→", currentPage + 1, { disabled: currentPage >= totalPages }));
  box.innerHTML = parts.join("");
}

function goToPage(page) {
  currentPage = page;
  loadEvents();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- 12. Event detail ---------- */

async function renderDetail(id) {
  app.innerHTML = `<div class="skeleton" style="height:420px"></div>`;

  let event;
  try {
    event = await api(`/api/events/${id}`);
  } catch {
    app.innerHTML = `<div class="empty-state"><p>Event not found.</p></div>`;
    return;
  }

  const { text, free } = priceLabel(event.price);
  const hero = event.image_url
    ? `<img src="${esc(event.image_url)}" alt="" onerror="this.remove()">`
    : categoryIcon(event.category);

  const bookingForm = currentUser?.logged_in
    ? `<div class="booking-bar">
         <label class="muted" style="font-size:0.82rem">Qty</label>
         <input id="qty" type="number" value="1" min="1" max="${event.tickets}">
         <button class="primary btn-grow" onclick="bookTicket(${event.id})">Book now</button>
       </div>
       <div id="err" class="error" style="margin-top:0.75rem"></div>`
    : `<p class="form-links" style="margin-top:1.5rem">
         <a onclick="navigate('login')">Sign in</a> to book tickets
       </p>`;

  app.innerHTML = `
    <button class="back-btn" onclick="navigate('events')">← All events</button>
    <div style="max-width:720px;margin:0 auto">
      <div class="detail-hero">${hero}</div>
      <h1 class="display detail-title">${esc(event.title)}</h1>
      <div class="meta">
        <span class="tag">📅 ${formatDate(event.date)}</span>
        <span class="tag">📍 ${esc(event.location)}</span>
        <span class="tag">${esc(event.category || "General")}</span>
      </div>
      <p class="detail-desc">${esc(event.description)}</p>
      <div class="flex-between" style="padding-top:1.25rem;border-top:1px solid var(--line)">
        <div>
          <span class="price${free ? " free" : ""}" style="font-size:1.3rem">${text}</span>
          <span class="muted" style="font-size:0.82rem;margin-left:0.6rem">${event.tickets} tickets available</span>
        </div>
        <span class="muted" style="font-size:0.78rem">Hosted by ${esc(event.creator)}</span>
      </div>
      ${bookingForm}
    </div>`;
}

async function bookTicket(eventId) {
  const quantity = parseInt(val("qty"), 10);
  if (!quantity || quantity < 1) return;

  try {
    const booking = await api("/api/book", {
      method: "POST",
      body: JSON.stringify({ event_id: eventId, quantity }),
    });
    // The API doesn't echo event_id back, so remember it for the back button.
    lastBooking = { ...booking, event_id: eventId };

    if (booking.free) {
      toast("Booked — see you there!");
      navigate("bookingConfirm");
    } else {
      navigate("payment");
    }
  } catch (e) {
    const errEl = document.getElementById("err");
    if (errEl) errEl.textContent = e.message;
  }
}

/* ---------- 13. Payment ---------- */

function cardFields() {
  return `
    <input id="p-card" placeholder="4242 4242 4242 4242" maxlength="19"
           oninput="formatCard(this)" autocomplete="cc-number">
    <div style="display:flex;gap:0.6rem">
      <input id="p-exp" placeholder="MM/YY" maxlength="5" oninput="formatExpiry(this)"
             autocomplete="cc-exp">
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

function renderPayment() {
  if (!lastBooking || lastBooking.free) return navigate("events");
  const b = lastBooking;

  app.innerHTML = `
    <button class="back-btn" onclick="goBackFromCheckout()">← Back</button>
    <div class="auth-wrap" style="margin-top:0">
      <h1 class="display" style="font-size:1.6rem">Checkout</h1>
      <p class="sub">Complete payment to confirm your tickets.</p>

      <div class="card">
        <div class="summary">
          <div class="summary-row"><span class="k">Event</span><span>${esc(b.title)}</span></div>
          <div class="summary-row"><span class="k">Tickets</span><span>${b.quantity}</span></div>
          <div class="summary-row total"><span>Total</span><span class="v">৳${Number(b.total).toFixed(2)}</span></div>
        </div>

        <div class="pay-methods" id="pay-methods">
          <button class="active" data-method="card"  onclick="selectPayMethod('card')">💳 Card</button>
          <button data-method="bkash" onclick="selectPayMethod('bkash')">📱 bKash</button>
          <button data-method="nagad" onclick="selectPayMethod('nagad')">📱 Nagad</button>
        </div>

        <div id="err" class="error"></div>
        <div id="pay-fields">${cardFields()}</div>

        <button class="primary" id="pay-btn" style="width:100%;margin-top:0.5rem"
                onclick="processPayment()">Pay ৳${Number(b.total).toFixed(2)}</button>

        <p class="muted" style="font-size:0.72rem;text-align:center;margin-top:1rem;line-height:1.6">
          Demo mode — no real charges.<br>Visa starts with 4, Mastercard with 5. Cards ending 0000 are declined.
        </p>
      </div>
    </div>`;
}

/** Return to the event page when we know it, otherwise the event list. */
function goBackFromCheckout() {
  if (lastBooking?.event_id) navigate("detail", lastBooking.event_id);
  else navigate("events");
}

function selectPayMethod(method) {
  payMethod = method;
  document.querySelectorAll("#pay-methods button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.method === method);
  });
  document.getElementById("pay-fields").innerHTML =
    method === "card" ? cardFields() : mobileFields(method);
}

function formatCard(input) {
  const digits = input.value.replace(/\D/g, "").slice(0, 16);
  input.value = digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(input) {
  let digits = input.value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) digits = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  input.value = digits;
}

function resetPayButton() {
  const btn = document.getElementById("pay-btn");
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = `Pay ৳${Number(lastBooking.total).toFixed(2)}`;
}

async function processPayment() {
  const btn   = document.getElementById("pay-btn");
  const errEl = document.getElementById("err");
  errEl.textContent = "";

  const payload = { booking_id: lastBooking.booking_id, method: payMethod };

  if (payMethod === "card") {
    payload.card_number = val("p-card");
    if (!payload.card_number.replace(/\s/g, "")) {
      return void (errEl.textContent = "Enter your card number");
    }
  } else {
    payload.card_number = "5000000000000001"; // placeholder for mobile wallets
    const mobile = val("p-mobile");
    if (mobile.length < 11) return void (errEl.textContent = "Enter a valid mobile number");
  }

  btn.disabled = true;
  btn.textContent = "Processing…";
  await new Promise((r) => setTimeout(r, 1500));

  try {
    const result = await api("/api/pay", { method: "POST", body: JSON.stringify(payload) });
    lastBooking.transaction_id = result.transaction_id;
    lastBooking.payment_method = result.method;
    navigate("bookingConfirm");
  } catch (e) {
    errEl.textContent = e.message;
    resetPayButton();
  }
}

/* ---------- 14. Booking confirmation ---------- */

function renderBookingConfirm() {
  if (!lastBooking) return navigate("events");
  const b = lastBooking;

  const rows = [
    `<div class="summary-row"><span class="k">Tickets</span><span>${b.quantity}</span></div>`,
    `<div class="summary-row"><span class="k">Total paid</span><span class="v" style="color:var(--gold);font-weight:600">৳${Number(b.total).toFixed(2)}</span></div>`,
  ];
  if (b.transaction_id)  rows.push(`<div class="summary-row"><span class="k">Transaction</span><span class="muted" style="font-family:monospace;font-size:0.75rem">${esc(b.transaction_id)}</span></div>`);
  if (b.payment_method)  rows.push(`<div class="summary-row"><span class="k">Method</span><span>${esc(b.payment_method).toUpperCase()}</span></div>`);

  app.innerHTML = `
    <div class="card confirm-box" style="max-width:480px;margin:2rem auto">
      <div class="confirm-check">✓</div>
      <h2 class="display">You're in!</h2>
      <p class="muted" style="margin-bottom:1.5rem">${esc(b.title)}</p>
      <div class="summary" style="text-align:left">${rows.join("")}</div>
      <p class="muted" style="font-size:0.75rem;margin-bottom:1.5rem">Booking #${b.booking_id}</p>
      <div style="display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap">
        <button class="ghost" onclick="navigate('bookings')">My tickets</button>
        <button class="primary" onclick="navigate('events')">Browse more</button>
      </div>
    </div>`;
}

/* ---------- 15. My bookings ---------- */

async function renderBookings() {
  if (!currentUser?.logged_in) return navigate("login");

  app.innerHTML = `
    <div class="view-head">
      <div class="eyebrow">Your tickets</div>
      <h1 class="display">My bookings</h1>
    </div>
    <div id="bookings-list">${skeletonGrid(3)}</div>`;

  const list = document.getElementById("bookings-list");

  try {
    const bookings = await api("/api/bookings");

    if (!bookings.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon">🎫</div>
          <p>You haven't booked anything yet.</p>
          <button class="primary" onclick="navigate('events')">Browse events</button>
        </div>`;
      return;
    }

    list.innerHTML = bookings.map(bookingRow).join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Couldn't load your bookings.</p></div>`;
  }
}

function bookingRow(b) {
  const pending = b.status === "pending_payment";
  const statusTag = pending
    ? `<span class="tag gold">⏳ Pending payment</span>`
    : `<span class="tag success">✓ Confirmed</span>`;

  const action = pending
    ? `<button class="primary" data-action="resume" data-booking='${JSON.stringify({ id: b.id, title: b.title, quantity: b.quantity, price: b.price, event_id: b.event_id })}'>Pay now</button>`
    : `<button class="danger" data-action="cancel" data-id="${b.id}">Cancel</button>`;

  return `
    <div class="card list-row">
      <div class="info">
        <h3 style="margin-bottom:0.5rem">${esc(b.title)}</h3>
        <div class="meta">
          <span class="tag">📅 ${formatDate(b.date)}</span>
          <span class="tag">📍 ${esc(b.location)}</span>
          ${statusTag}
        </div>
        <p class="muted" style="font-size:0.82rem;margin-top:0.6rem">
          ${b.quantity} ticket${b.quantity > 1 ? "s" : ""} ·
          <strong style="color:var(--text)">৳${(b.price * b.quantity).toFixed(2)}</strong>
        </p>
      </div>
      <div class="actions">${action}</div>
    </div>`;
}

/** Delegated handler — avoids quote-escaping inside inline onclick. */
function onBookingAction(clickEvent) {
  const button = clickEvent.target.closest("button[data-action]");
  if (!button) return;

  if (button.dataset.action === "cancel") {
    cancelBooking(Number(button.dataset.id));
  } else if (button.dataset.action === "resume") {
    const info = JSON.parse(button.dataset.booking);
    lastBooking = {
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

async function cancelBooking(bookingId) {
  const confirmed = await confirmModal("Cancel booking", "Your tickets will be released back to the event.");
  if (!confirmed) return;

  try {
    await api(`/api/bookings/${bookingId}`, { method: "DELETE" });
    toast("Booking cancelled");
    renderBookings();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ---------- 16. Profile ---------- */

function renderProfile() {
  if (!currentUser?.logged_in) return navigate("login");

  app.innerHTML = `
    <div class="auth-wrap" style="margin-top:0">
      <h1 class="display" style="font-size:1.75rem">@${esc(currentUser.username)}</h1>
      <p class="sub" style="text-transform:capitalize">${esc(currentUser.role)} account</p>

      <div class="card">
        <h2 style="font-size:1.05rem;margin-bottom:1.25rem">Change password</h2>
        <div id="err" class="error"></div>
        <label class="field-label" for="old-pw">Current password</label>
        <input id="old-pw" type="password" placeholder="••••••••" autocomplete="current-password">
        <label class="field-label" for="new-pw">New password</label>
        <input id="new-pw" type="password" placeholder="at least 4 characters" autocomplete="new-password">
        <button class="primary" style="width:100%;margin-top:0.5rem" onclick="changePassword()">Update password</button>
      </div>
    </div>`;

  onEnter("old-pw", changePassword);
  onEnter("new-pw", changePassword);
}

async function changePassword() {
  const oldPassword = val("old-pw");
  const newPassword = val("new-pw");
  const errEl = document.getElementById("err");
  errEl.textContent = "";

  if (!oldPassword || !newPassword) return void (errEl.textContent = "Fill in both fields");

  try {
    await api("/api/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
    toast("Password updated");
    document.getElementById("old-pw").value = "";
    document.getElementById("new-pw").value = "";
  } catch (e) {
    errEl.textContent = e.message;
  }
}

/* ---------- 17. Admin dashboard ---------- */

async function renderAdmin() {
  if (currentUser?.role !== "admin") return navigate("events");

  app.innerHTML = `<div class="skeleton" style="height:320px"></div>`;

  try {
    const [stats, list] = await Promise.all([
      api("/api/admin/stats"),
      api("/api/events?page=1&sort=date_desc"),
    ]);

    const popular = stats.popular.length
      ? `<div class="card" style="margin-bottom:1.5rem">
           <h3 style="font-size:0.95rem;margin-bottom:0.75rem">Top events</h3>
           ${stats.popular.map((p) => `
             <div class="summary-row" style="border-bottom:1px solid var(--line);padding:0.5rem 0">
               <span>${esc(p.title)}</span>
               <span class="tag">${p.sold} sold</span>
             </div>`).join("")}
         </div>`
      : "";

    const eventRows = list.events.map((e) => `
      <div class="card list-row">
        <div class="info">
          <strong>${esc(e.title)}</strong>
          <p class="muted" style="font-size:0.8rem;margin-top:0.3rem">
            ${formatDate(e.date)} · ${e.tickets} left · ${esc(e.category || "General")}
          </p>
        </div>
        <div class="actions">
          <button class="ghost" onclick="navigate('editEvent',${e.id})">Edit</button>
          <button class="danger" onclick="deleteEvent(${e.id})">Delete</button>
        </div>
      </div>`).join("");

    app.innerHTML = `
      <div class="view-head flex-between">
        <div>
          <div class="eyebrow">Admin</div>
          <h1 class="display">Dashboard</h1>
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
          <button class="ghost" onclick="exportBookingsCsv()">Export CSV</button>
          <button class="primary" onclick="navigate('createEvent')">+ New event</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="card stat-card"><div class="stat-value">${stats.total_events}</div><div class="stat-label">Events</div></div>
        <div class="card stat-card"><div class="stat-value">${stats.total_bookings}</div><div class="stat-label">Bookings</div></div>
        <div class="card stat-card"><div class="stat-value">৳${Number(stats.revenue).toFixed(0)}</div><div class="stat-label">Revenue</div></div>
      </div>

      ${popular}

      <h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin:2rem 0 1rem">All events</h3>
      ${eventRows || `<div class="empty-state"><p>No events yet.</p></div>`}`;
  } catch {
    app.innerHTML = `<div class="empty-state"><p>Couldn't load the dashboard.</p></div>`;
  }
}

async function deleteEvent(eventId) {
  const confirmed = await confirmModal("Delete event", "This also removes every booking for it. This cannot be undone.");
  if (!confirmed) return;

  try {
    await api(`/api/events/${eventId}`, { method: "DELETE" });
    toast("Event deleted");
    renderAdmin();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function exportBookingsCsv() {
  const res  = await fetch("/api/export-bookings", { headers: { "X-CSRF-Token": csrfToken } });
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bookings.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------- 18. Create / edit event ---------- */

const EVENT_CATEGORIES = ["General", "Tech", "Music", "Art", "Sports", "Food", "Education"];

function eventFormHtml(heading, event = {}) {
  const categoryOptions = EVENT_CATEGORIES
    .map((c) => `<option value="${c}" ${(event.category || "General") === c ? "selected" : ""}>${c}</option>`)
    .join("");

  return `
    <div class="auth-wrap" style="max-width:560px">
      <h1 class="display" style="font-size:1.6rem;margin-bottom:1.5rem">${heading}</h1>
      <div class="card">
        <div id="err" class="error"></div>

        <label class="field-label">Title</label>
        <input id="f-title" placeholder="Event name" value="${esc(event.title || "")}">

        <label class="field-label">Description</label>
        <textarea id="f-desc" rows="4" placeholder="What should people expect?">${esc(event.description || "")}</textarea>

        <label class="field-label">Category</label>
        <select id="f-cat">${categoryOptions}</select>

        <label class="field-label">Date &amp; time</label>
        <input id="f-date" type="datetime-local" value="${esc(event.date || "")}">

        <label class="field-label">Location</label>
        <input id="f-loc" placeholder="Venue, city" value="${esc(event.location || "")}">

        <div style="display:flex;gap:0.75rem">
          <div style="flex:1">
            <label class="field-label">Price (৳)</label>
            <input id="f-price" type="number" min="0" step="0.01" placeholder="0 for free" value="${event.price ?? ""}">
          </div>
          <div style="flex:1">
            <label class="field-label">Tickets</label>
