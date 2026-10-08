// event list + detail

import { appRoot, get, post, store } from "../api.js";
import { navigate } from "../router.js";
import { clearSearch, setSearchBusy } from "../nav.js";
import { toast } from "../ui.js";
import {
  categoryIcon, emptyState, esc, formatDate, formatMoney,
  priceLabel, setBusy, skeletonGrid, val,
} from "../utils.js";


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

export async function renderEvents() {
  // keep the header box in sync with the stored query
  const headerSearch = document.getElementById("nav-search");
  if (headerSearch && headerSearch.value !== store.query) headerSearch.value = store.query;

  appRoot.innerHTML = `
    <div class="view-head">
      <div class="eyebrow">Discover</div>
      <h1 class="display">Find your next event</h1>
    </div>
    <div class="toolbar">
      <select id="cat-filter">
        <option value="All">All categories</option>
      </select>
      <select id="sort">
        <option value="date_asc">Date · soonest</option>
        <option value="date_desc">Date · latest</option>
        <option value="price_asc">Price · low to high</option>
        <option value="price_desc">Price · high to low</option>
        <option value="newest">Recently added</option>
      </select>
    </div>
    <div id="events-grid">${skeletonGrid(6)}</div>
    <div id="pagination" class="pagination"></div>`;

  document.getElementById("cat-filter").value = store.category;
  document.getElementById("sort").value = store.sort;
  document.getElementById("cat-filter").onchange = (e) => {
    store.category = e.target.value;
    store.page = 1;
    loadEvents();
  };
  document.getElementById("sort").onchange = (e) => {
    store.sort = e.target.value;
    store.page = 1;
    loadEvents();
  };

  loadEvents();
}

export async function loadEvents() {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  grid.innerHTML = skeletonGrid(6);
  setSearchBusy(true);

  try {
    const params = new URLSearchParams({
      q: store.query,
      category: store.category,
      sort: store.sort,
      page: store.page,
      upcoming: "1",
    });
    const data = await get(`/api/events?${params}`);

    syncCategoryFilter(data.categories);

    if (!data.events.length) {
      grid.innerHTML = emptyState({
        icon: "🔍",
        message: "No events match your search.",
        actionLabel: "Clear filters",
        action: "clearFilters()",
      });
      document.getElementById("pagination").innerHTML = "";
      return;
    }

    grid.innerHTML = `<div class="grid">${data.events.map(eventCard).join("")}</div>`;
    renderPagination(data.pages);
  } catch {
    grid.innerHTML = emptyState({ icon: "⚠️", message: "Couldn't load events. Try again." });
  } finally {
    setSearchBusy(false);
  }
}

function syncCategoryFilter(categories = []) {
  const select = document.getElementById("cat-filter");
  if (!select) return;
  select.innerHTML =
    `<option value="All">All categories</option>` +
    categories
      .map((c) => `<option value="${esc(c)}" ${c === store.category ? "selected" : ""}>${esc(c)}</option>`)
      .join("");
}

function renderPagination(totalPages) {
  const box = document.getElementById("pagination");
  if (totalPages <= 1) {
    box.innerHTML = "";
    return;
  }

  const btn = (label, page, { active = false, disabled = false } = {}) =>
    `<button ${disabled ? "disabled" : ""} class="${active ? "active" : ""}"
       onclick="goToPage(${page})">${label}</button>`;

  const parts = [btn("←", store.page - 1, { disabled: store.page <= 1 })];

  for (let i = 1; i <= totalPages; i++) {
    const far = totalPages > 7 && Math.abs(i - store.page) > 2 && i !== 1 && i !== totalPages;
    if (far) {
      if (i === 2 || i === totalPages - 1) parts.push(`<button disabled>…</button>`);
      continue;
    }
    parts.push(btn(i, i, { active: i === store.page }));
  }

  parts.push(btn("→", store.page + 1, { disabled: store.page >= totalPages }));
  box.innerHTML = parts.join("");
}

export function goToPage(page) {
  store.page = page;
  loadEvents();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function clearFilters() {
  clearSearch();
  store.category = "All";
  store.page = 1;
  renderEvents();
}


export async function renderDetail(id) {
  appRoot.innerHTML = `<div class="skeleton" style="height:420px"></div>`;

  let event;
  try {
    event = await get(`/api/events/${id}`);
  } catch {
    appRoot.innerHTML = emptyState({ icon: "🚫", message: "Event not found." });
    return;
  }

  const { text, free } = priceLabel(event.price);
  const hero = event.image_url
    ? `<img src="${esc(event.image_url)}" alt="" onerror="this.remove()">`
    : categoryIcon(event.category);

  // lineup chips, only if artists were booked
  const lineup = event.artists?.length
    ? `<div style="margin:1.25rem 0">
         <div class="field-label">Lineup</div>
         <div class="lineup">
           ${event.artists.map((a) => `<span class="artist-chip">🎤 ${esc(a.name)}</span>`).join("")}
         </div>
       </div>`
    : "";

  // tiers if defined, else a plain qty box
  const tiers = event.tiers || [];
  const bookingForm = store.user?.logged_in
    ? `<div class="booking-bar">
         ${tiers.length
           ? `<select id="tier" style="flex:1;min-width:180px;margin:0">
                ${tiers.map((t) => {
                  const left = t.quantity - t.sold;
                  return `<option value="${t.id}" ${left <= 0 ? "disabled" : ""}>
                            ${esc(t.name)} — ৳${t.price} ${left > 0 ? `(${left} left)` : "(sold out)"}
                          </option>`;
                }).join("")}
              </select>`
           : `<label class="muted" style="font-size:0.82rem">Qty</label>`}
         <input id="qty" type="number" value="1" min="1" max="${event.tickets}">
         <button class="primary btn-grow" id="book-btn">Book now</button>
       </div>
       <div id="err" class="error" style="margin-top:0.75rem"></div>`
    : `<p class="form-links" style="margin-top:1.5rem">
         <a id="to-login">Sign in</a> to book tickets
       </p>`;

  // budget only for owner/admin
  const canManage = store.user?.role === "admin" || store.user?.id === event.created_by;
  const budgetBlock = canManage && event.budget
    ? `<div class="card" style="margin-top:1.5rem">
         <div class="field-label">Production budget</div>
         <div class="budget-row"><span>Venue + artists + costs</span>
           <span class="amount">${formatMoney(event.budget.total_expenses)}</span></div>
         ${event.budget.sponsorship > 0
           ? `<div class="budget-row sub"><span>Sponsorship</span>
                <span class="amount">−${formatMoney(event.budget.sponsorship)}</span></div>` : ""}
         <div class="budget-row total"><span>Net to recover</span>
           <span class="amount">${formatMoney(event.budget.net_expense)}</span></div>
         <div class="budget-row sub"><span>Base ticket price</span>
           <span class="amount">৳${event.budget.base_ticket_price}</span></div>
       </div>`
    : "";

  appRoot.innerHTML = `
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
      ${lineup}
      <div class="flex-between" style="padding-top:1.25rem;border-top:1px solid var(--line)">
        <div>
          <span class="price${free ? " free" : ""}" style="font-size:1.3rem">${text}</span>
          <span class="muted" style="font-size:0.82rem;margin-left:0.6rem">
            ${event.tickets} tickets available
          </span>
        </div>
        <span class="muted" style="font-size:0.78rem">Hosted by ${esc(event.creator)}</span>
      </div>
      ${bookingForm}
      ${budgetBlock}
    </div>`;

  if (store.user?.logged_in) {
    document.getElementById("book-btn").onclick = () => bookTicket(event.id);
  } else {
    document.getElementById("to-login").onclick = () => navigate("login");
  }
}

export async function bookTicket(eventId) {
  const quantity = parseInt(val("qty"), 10);
  if (!quantity || quantity < 1) return;

  const tierEl = document.getElementById("tier");
  const tierId = tierEl ? Number(tierEl.value) : null;

  const btn = document.getElementById("book-btn");
  setBusy(btn, true, "Booking…");

  try {
    const booking = await post("/api/book", {
      event_id: eventId,
      quantity,
      tier_id: tierId,
    });

    // api doesn't echo event_id, stash it for the checkout back button
    store.lastBooking = { ...booking, event_id: eventId };

    if (booking.free) {
      toast("Booked — see you there!");
      navigate("bookingConfirm");
    } else {
      navigate("payment");
    }
  } catch (e) {
    setBusy(btn, false);
    const errEl = document.getElementById("err");
    if (errEl) errEl.textContent = e.message;
  }
}