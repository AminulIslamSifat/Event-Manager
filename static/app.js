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
