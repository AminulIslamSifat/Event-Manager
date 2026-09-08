let currentUser = null;
let csrfToken = "";
const app = document.getElementById("app");
const navLinks = document.getElementById("nav-links");

// --- API Layer ---
async function initCsrf() {
    const res = await fetch("/api/csrf");
    const data = await res.json();
    csrfToken = data.token;
}

async function api(url, opts = {}) {
    const headers = { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, ...(opts.headers || {}) };
    const res = await fetch(url, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "request failed");
    return data;
}

// --- Toast ---
function toast(msg, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.classList.add("fade-out"); setTimeout(() => el.remove(), 300); }, 3000);
}

// --- Confirm Modal ---
function confirmModal(title, message) {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `<div class="modal"><h3>${title}</h3><p>${message}</p>
            <div class="modal-actions"><button class="ghost" id="modal-cancel">Cancel</button><button class="danger" id="modal-confirm">Confirm</button></div></div>`;
        document.body.appendChild(overlay);
        overlay.querySelector("#modal-cancel").onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector("#modal-confirm").onclick = () => { overlay.remove(); resolve(true); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
}

// --- Helpers ---
function formatDate(d) {
    if (!d) return "";
    try {
        const dt = new Date(d.replace("T", " "));
        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch { return d; }
}

function formatPrice(p) {
    return p <= 0 ? '<span class="tag free-tag">Free</span>' : `৳${Number(p).toFixed(p % 1 === 0 ? 0 : 2)}`;
}

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function skeleton(n = 6) {
    return `<div class="grid">${Array(n).fill('<div class="skeleton skeleton-card"></div>').join("")}</div>`;
}

function emptyState(icon, msg, btnText = "", btnAction = "") {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p>${btnText ? `<button class="primary" onclick="${btnAction}">${btnText}</button>` : ""}</div>`;
}

const categoryIcons = { "Tech": "💻", "Music": "🎵", "Art": "🎨", "Sports": "⚽", "Food": "🍕", "Education": "📚", "General": "📌" };

// --- Navigation ---
let currentView = "events";
let viewParam = null;

function navigate(view, param) {
    currentView = view;
    viewParam = param;
    history.pushState({ view, param }, "", `#${view}${param !== undefined ? "/" + param : ""}`);
    render();
}

window.addEventListener("popstate", (e) => {
    if (e.state) { currentView = e.state.view; viewParam = e.state.param; render(); }
    else { parseHash(); render(); }
});

function parseHash() {
    const h = location.hash.slice(1) || "events";
    const parts = h.split("/");
    currentView = parts[0] || "events";
    viewParam = parts[1] ? (isNaN(parts[1]) ? parts[1] : parseInt(parts[1])) : null;
}

function render() {
    const views = { events: renderEvents, login: renderLogin, register: renderRegister, detail: renderDetail, bookings: renderBookings, admin: renderAdmin, createEvent: renderCreateEvent, editEvent: renderEditEvent, profile: renderProfile, bookingConfirm: renderBookingConfirm };
    if (views[currentView]) views[currentView](viewParam);
    else renderEvents();
}

function updateNav() {
    navLinks.innerHTML = "";
    const btn = (text, fn) => { const b = document.createElement("button"); b.textContent = text; b.onclick = fn; navLinks.appendChild(b); };
    if (currentUser && currentUser.logged_in) {
        btn("Events", () => navigate("events"));
        btn("My Bookings", () => navigate("bookings"));
        if (currentUser.role === "admin") btn("Manage", () => navigate("admin"));
        btn(currentUser.username, () => navigate("profile"));
        btn("Logout", async () => {
            await api("/api/logout", { method: "POST" });
            currentUser = null; updateNav(); navigate("events");
        });
    } else {
        btn("Login", () => navigate("login"));
        btn("Register", () => navigate("register"));
    }
}

// --- Auth ---
async function checkAuth() {
    await initCsrf();
    try { currentUser = await api("/api/me"); } catch { currentUser = null; }
    if (currentUser && !currentUser.logged_in) currentUser = null;
    updateNav();
    parseHash();
    render();
}

function renderLogin() {
    app.innerHTML = `<div class="form-group card"><h2>Welcome Back</h2><p style="color:var(--text-dim);margin:0.5rem 0 1rem;font-size:0.9rem">Login to your account</p>
        <div id="err" class="error"></div>
        <input id="u" placeholder="Username" autocomplete="username">
        <input id="p" type="password" placeholder="Password" autocomplete="current-password">
        <button class="primary" onclick="doLogin()" style="width:100%;margin-top:0.3rem">Login</button>
        <p class="form-links">Don't have an account? <a onclick="navigate('register')">Register</a></p></div>`;
    setupEnterKey("p", doLogin);
    setupEnterKey("u", doLogin);
}

async function doLogin() {
    const u = document.getElementById("u").value.trim();
    const p = document.getElementById("p").value;
    if (!u || !p) { document.getElementById("err").textContent = "Fill in all fields"; return; }
    try {
        currentUser = await api("/api/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
        currentUser.logged_in = true;
        updateNav(); toast("Logged in!"); navigate("events");
    } catch (e) { document.getElementById("err").textContent = e.message; }
}

function renderRegister() {
    app.innerHTML = `<div class="form-group card"><h2>Create Account</h2><p style="color:var(--text-dim);margin:0.5rem 0 1rem;font-size:0.9rem">Join Event Khujo to book tickets</p>
        <div id="err" class="error"></div>
        <input id="u" placeholder="Choose a username (min 3 chars)" autocomplete="username">
        <input id="p" type="password" placeholder="Create a password (min 4 chars)" autocomplete="new-password">
        <button class="primary" onclick="doRegister()" style="width:100%;margin-top:0.3rem">Create Account</button>
        <p class="form-links">Already have an account? <a onclick="navigate('login')">Login</a></p></div>`;
    setupEnterKey("p", doRegister);
    setupEnterKey("u", doRegister);
}

async function doRegister() {
    const u = document.getElementById("u").value.trim();
    const p = document.getElementById("p").value;
    if (!u || !p) { document.getElementById("err").textContent = "Fill in all fields"; return; }
    try {
        await api("/api/register", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
        toast("Account created! Please login."); navigate("login");
    } catch (e) { document.getElementById("err").textContent = e.message; }
}

function setupEnterKey(inputId, fn) {
    const el = document.getElementById(inputId);
    if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") fn(); });
}

// --- Events List ---
let searchQuery = "";
let filterCategory = "All";
let sortBy = "date_asc";
let currentPage = 1;

async function renderEvents() {
    app.innerHTML = `<h2 style="margin-bottom:0.75rem;font-size:1.3rem">Discover Events</h2>
        <div class="toolbar">
            <input id="search" placeholder="Search events..." value="${esc(searchQuery)}">
            <select id="cat-filter" onchange="filterCategory=this.value;currentPage=1;renderEvents()"><option value="All">All Categories</option></select>
            <select id="sort" onchange="sortBy=this.value;currentPage=1;renderEvents()">
                <option value="date_asc" ${sortBy==="date_asc"?"selected":""}>Date ↑</option>
                <option value="date_desc" ${sortBy==="date_desc"?"selected":""}>Date ↓</option>
                <option value="price_asc" ${sortBy==="price_asc"?"selected":""}>Price ↑</option>
                <option value="price_desc" ${sortBy==="price_desc"?"selected":""}>Price ↓</option>
            </select>
        </div>
        <div id="events-grid">${skeleton()}</div>
        <div id="pagination" class="pagination"></div>`;

    const searchEl = document.getElementById("search");
    let debounce;
    searchEl.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { searchQuery = searchEl.value; currentPage = 1; loadEvents(); }, 300);
    });
    searchEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { searchQuery = searchEl.value; currentPage = 1; loadEvents(); } });
    loadEvents();
}

async function loadEvents() {
    const grid = document.getElementById("events-grid");
    if (!grid) return;
    grid.innerHTML = skeleton();
    try {
        const params = new URLSearchParams({ q: searchQuery, category: filterCategory, sort: sortBy, page: currentPage, upcoming: "1" });
        const data = await api(`/api/events?${params}`);

        // Populate category filter
        const catSelect = document.getElementById("cat-filter");
        if (catSelect && data.categories) {
            const current = catSelect.value;
            catSelect.innerHTML = '<option value="All">All Categories</option>' + data.categories.map(c => `<option value="${esc(c)}" ${c===current?"selected":""}>${esc(c)}</option>`).join("");
        }

        if (data.events.length === 0) {
            grid.innerHTML = emptyState("🔍", "No events found", "Clear filters", "searchQuery='';filterCategory='All';currentPage=1;renderEvents()");
            document.getElementById("pagination").innerHTML = "";
            return;
        }

        grid.innerHTML = `<div class="grid">${data.events.map(e => `
            <div class="card event-card" onclick="navigate('detail',${e.id})">
                <div class="event-img">${e.image_url ? `<img src="${esc(e.image_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.parentElement.innerHTML='${categoryIcons[e.category]||'📌'}'">` : (categoryIcons[e.category] || "📌")}</div>
                <h2>${esc(e.title)}</h2>
                <div class="meta">
                    <span class="tag">${formatDate(e.date)}</span>
                    <span class="tag">${esc(e.category || 'General')}</span>
                </div>
                <div class="meta"><span>📍 ${esc(e.location)}</span></div>
                <p style="margin-top:0.4rem;display:flex;justify-content:space-between;align-items:center">
                    <span>${formatPrice(e.price)}</span>
                    <span style="font-size:0.8rem;color:var(--text-dim)">${e.tickets} left</span>
                </p>
            </div>`).join("")}</div>`;

        // Pagination
        const pag = document.getElementById("pagination");
        if (data.pages > 1) {
            let html = `<button ${currentPage<=1?"disabled":""} onclick="currentPage--;loadEvents()">← Prev</button>`;
            for (let i = 1; i <= data.pages; i++) {
                if (data.pages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== data.pages) {
                    if (i === 2 || i === data.pages - 1) html += `<button disabled>…</button>`;
                    continue;
                }
                html += `<button class="${i===currentPage?'active':''}" onclick="currentPage=${i};loadEvents()">${i}</button>`;
            }
            html += `<button ${currentPage>=data.pages?"disabled":""} onclick="currentPage++;loadEvents()">Next →</button>`;
            pag.innerHTML = html;
        } else { pag.innerHTML = ""; }
    } catch (e) { grid.innerHTML = `<p class="error">Failed to load events</p>`; }
}

// --- Event Detail ---
async function renderDetail(id) {
    app.innerHTML = skeleton(1);
    try {
        const e = await api(`/api/events/${id}`);
        app.innerHTML = `<button class="back-btn" onclick="navigate('events')">← Back to events</button>
            <div class="card" style="max-width:640px;margin:0 auto">
                ${e.image_url ? `<img src="${esc(e.image_url)}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;margin-bottom:1rem" onerror="this.style.display='none'">` : `<div class="event-img" style="height:160px;border-radius:12px;margin-bottom:1rem;font-size:3rem">${categoryIcons[e.category]||'📌'}</div>`}
                <h2 style="font-size:1.4rem;margin-bottom:0.5rem">${esc(e.title)}</h2>
                <div class="meta">
                    <span class="tag">📅 ${formatDate(e.date)}</span>
                    <span class="tag">📍 ${esc(e.location)}</span>
                    <span class="tag">${esc(e.category || 'General')}</span>
                </div>
                <p style="margin:1rem 0;line-height:1.6;color:var(--text)">${esc(e.description)}</p>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 0;border-top:1px solid var(--border)">
                    <div><strong style="font-size:1.2rem">${formatPrice(e.price)}</strong><span style="color:var(--text-dim);font-size:0.85rem;margin-left:0.5rem">${e.tickets} tickets available</span></div>
                    <span style="font-size:0.8rem;color:var(--text-dim)">By ${esc(e.creator)}</span>
                </div>
                ${currentUser && currentUser.logged_in ? `
                <div style="display:flex;gap:0.5rem;align-items:center;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
                    <label style="font-size:0.85rem;color:var(--text-dim)">Qty:</label>
                    <input id="qty" type="number" value="1" min="1" max="${e.tickets}" style="width:80px;margin:0">
                    <button class="primary" onclick="bookTicket(${e.id})" style="flex:1">Book Now</button>
                </div>
                <div id="err" class="error" style="margin-top:0.5rem"></div>` :
                `<p style="margin-top:1rem;text-align:center"><a style="color:var(--accent);cursor:pointer" onclick="navigate('login')">Login to book tickets</a></p>`}
            </div>`;
    } catch { app.innerHTML = `<div class="card"><p>Event not found.</p></div>`; }
}

async function bookTicket(eventId) {
    const qty = parseInt(document.getElementById("qty").value);
    if (qty < 1) return;
    try {
        const data = await api("/api/book", { method: "POST", body: JSON.stringify({ event_id: eventId, quantity: qty }) });
        lastBooking = data;
        toast("Booked successfully!");
        navigate("bookingConfirm");
    } catch (e) {
        const errEl = document.getElementById("err");
        if (errEl) errEl.textContent = e.message;
    }
}

let lastBooking = null;
function renderBookingConfirm() {
    if (!lastBooking) { navigate("events"); return; }
    app.innerHTML = `<div class="card booking-confirm" style="max-width:460px;margin:2rem auto">
        <div class="check-icon">✅</div>
        <h2>Booking Confirmed!</h2>
        <p style="color:var(--text);margin:0.5rem 0">${esc(lastBooking.title)}</p>
        <p>Tickets: ${lastBooking.quantity} · Total: ৳${lastBooking.total}</p>
        <p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem">Booking #${lastBooking.booking_id}</p>
        <div style="display:flex;gap:0.5rem;margin-top:1.5rem;justify-content:center">
            <button class="ghost" onclick="navigate('bookings')">My Bookings</button>
            <button class="primary" onclick="navigate('events')">Browse More</button>
        </div>
    </div>`;
}

// --- Bookings ---
async function renderBookings() {
    if (!currentUser || !currentUser.logged_in) { navigate("login"); return; }
    app.innerHTML = `<h2 style="margin-bottom:1rem;font-size:1.3rem">My Bookings</h2><div id="bookings-list">${skeleton(3)}</div>`;
    try {
        const bookings = await api("/api/bookings");
        const list = document.getElementById("bookings-list");
        if (bookings.length === 0) {
            list.innerHTML = emptyState("🎫", "No bookings yet", "Browse Events", "navigate('events')");
            return;
        }
        list.innerHTML = bookings.map(b => `
            <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem">
                <div style="flex:1;min-width:200px">
                    <h2>${esc(b.title)}</h2>
                    <div class="meta"><span class="tag">📅 ${formatDate(b.date)}</span><span class="tag">📍 ${esc(b.location)}</span></div>
                    <p style="margin-top:0.3rem">Tickets: ${b.quantity} · Total: <strong>৳${(b.price * b.quantity).toFixed(2)}</strong></p>
                </div>
                <button class="danger" onclick="cancelBooking(${b.id})">Cancel</button>
            </div>`).join("");
    } catch { document.getElementById("bookings-list").innerHTML = `<p class="error">Failed to load bookings</p>`; }
}

async function cancelBooking(id) {
    const ok = await confirmModal("Cancel Booking", "Are you sure? Your tickets will be released.");
    if (!ok) return;
    try {
        await api(`/api/bookings/${id}`, { method: "DELETE" });
        toast("Booking cancelled");
        renderBookings();
    } catch (e) { toast(e.message, "error"); }
}

// --- Profile ---
function renderProfile() {
    if (!currentUser || !currentUser.logged_in) { navigate("login"); return; }
    app.innerHTML = `<div class="form-group card"><h2>Profile</h2><p style="color:var(--text-dim);margin:0.5rem 0 1rem">@${esc(currentUser.username)} · ${esc(currentUser.role)}</p>
        <h3 style="font-size:0.95rem;margin-bottom:0.75rem;color:var(--text-dim)">Change Password</h3>
        <div id="err" class="error"></div>
        <input id="old-pw" type="password" placeholder="Current password">
        <input id="new-pw" type="password" placeholder="New password (min 4 chars)">
        <button class="primary" onclick="changePw()" style="width:100%">Update Password</button></div>`;
    setupEnterKey("new-pw", changePw);
}

async function changePw() {
    const oldPw = document.getElementById("old-pw").value;
    const newPw = document.getElementById("new-pw").value;
    if (!oldPw || !newPw) { document.getElementById("err").textContent = "Fill in both fields"; return; }
    try {
        await api("/api/change-password", { method: "POST", body: JSON.stringify({ old_password: oldPw, new_password: newPw }) });
        toast("Password updated!");
        document.getElementById("old-pw").value = "";
        document.getElementById("new-pw").value = "";
    } catch (e) { document.getElementById("err").textContent = e.message; }
}

// --- Admin ---
async function renderAdmin() {
    if (!currentUser || currentUser.role !== "admin") { navigate("events"); return; }
    app.innerHTML = `${skeleton(4)}`;
    try {
        const [stats, data] = await Promise.all([api("/api/admin/stats"), api("/api/events?page=1&sort=date_desc")]);
        const events = data.events;
        app.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
                <h2 style="font-size:1.3rem">Dashboard</h2>
                <div style="display:flex;gap:0.5rem">
                    <button class="ghost" onclick="exportCSV()">📥 Export CSV</button>
                    <button class="primary" onclick="navigate('createEvent')">+ Add Event</button>
                </div>
            </div>
            <div class="stats-grid">
                <div class="card stat-card"><div class="stat-value">${stats.total_events}</div><div class="stat-label">Total Events</div></div>
                <div class="card stat-card"><div class="stat-value">${stats.total_bookings}</div><div class="stat-label">Total Bookings</div></div>
                <div class="card stat-card"><div class="stat-value">৳${stats.revenue.toFixed(0)}</div><div class="stat-label">Revenue</div></div>
            </div>
            ${stats.popular.length ? `<div class="card"><h2 style="margin-bottom:0.5rem">Top Events</h2>${stats.popular.map(p => `<div style="display:flex;justify-content:space-between;padding:0.3rem 0;border-bottom:1px solid var(--border)"><span>${esc(p.title)}</span><span class="tag">${p.sold} sold</span></div>`).join("")}</div>` : ""}
            <h3 style="margin:1rem 0 0.5rem;font-size:1rem;color:var(--text-dim)">All Events</h3>
            ${events.map(e => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
                <div><strong>${esc(e.title)}</strong><p style="font-size:0.8rem">${formatDate(e.date)} · ${e.tickets} left · ${esc(e.category||'')}</p></div>
                <div style="display:flex;gap:0.4rem"><button class="ghost" onclick="navigate('editEvent',${e.id})">Edit</button><button class="danger" onclick="deleteEvent(${e.id})">Delete</button></div>
            </div>`).join("")}`;
    } catch { app.innerHTML = `<p class="error">Failed to load admin panel</p>`; }
}

async function deleteEvent(id) {
    const ok = await confirmModal("Delete Event", "This will also remove all associated bookings. Continue?");
    if (!ok) return;
    try {
        await api(`/api/events/${id}`, { method: "DELETE" });
        toast("Event deleted");
        renderAdmin();
    } catch (e) { toast(e.message, "error"); }
}

async function exportCSV() {
    const res = await fetch("/api/export-bookings", { headers: { "X-CSRF-Token": csrfToken } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bookings.csv"; a.click();
    URL.revokeObjectURL(url);
}

// --- Event Form ---
function eventForm(title, e = {}) {
    return `<div class="form-group card"><h2>${title}</h2><br>
        <div id="err" class="error"></div>
        <input id="f-title" placeholder="Event title" value="${esc(e.title || '')}">
        <textarea id="f-desc" placeholder="Description" rows="4">${esc(e.description || '')}</textarea>
        <select id="f-cat">
            ${['General','Tech','Music','Art','Sports','Food','Education'].map(c => `<option value="${c}" ${(e.category||'General')===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <input id="f-date" type="datetime-local" value="${e.date || ''}">
        <input id="f-loc" placeholder="Location" value="${esc(e.location || '')}">
        <input id="f-price" type="number" placeholder="Price (৳) — 0 for free" step="0.01" min="0" value="${e.price ?? ''}">
        <input id="f-tickets" type="number" placeholder="Total tickets" min="1" value="${e.tickets ?? ''}">
        <input id="f-img" placeholder="Image URL (optional)" value="${esc(e.image_url || '')}">
        <button class="primary" id="submit-btn" style="width:100%">Save Event</button></div>`;
}

function getFormData() {
    return {
        title: v("f-title"), description: v("f-desc"), category: v("f-cat"),
        date: v("f-date"), location: v("f-loc"),
        price: parseFloat(v("f-price")) || 0, tickets: parseInt(v("f-tickets")) || 0,
        image_url: v("f-img")
    };
}

function renderCreateEvent() {
    app.innerHTML = eventForm("Create Event");
    document.getElementById("submit-btn").onclick = async () => {
        try {
            await api("/api/events", { method: "POST", body: JSON.stringify(getFormData()) });
            toast("Event created!"); navigate("admin");
        } catch (e) { document.getElementById("err").textContent = e.message; }
    };
}

async function renderEditEvent(id) {
    const e = await api(`/api/events/${id}`);
    app.innerHTML = eventForm("Edit Event", e);
    document.getElementById("submit-btn").onclick = async () => {
        try {
            await api(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(getFormData()) });
            toast("Event updated!"); navigate("admin");
        } catch (e) { document.getElementById("err").textContent = e.message; }
    };
}

function v(id) { return document.getElementById(id)?.value || ""; }

// Click logo to go home
document.querySelector("nav h1").onclick = () => navigate("events");

checkAuth();
