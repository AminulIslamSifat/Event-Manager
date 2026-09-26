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
