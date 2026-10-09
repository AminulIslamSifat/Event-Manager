// entry point. wires the router, registers views, restores the session.

import { appRoot, get, initCsrf, store } from "./api.js";
import { initRouter, navigate, readHash, render, route } from "./router.js";
import { setupHeaderSearch, updateNav } from "./nav.js";

// Views
import { renderLogin, renderRegister } from "./views/auth.js";
import { clearFilters, goToPage, loadEvents, renderDetail, renderEvents } from "./views/events.js";
import { renderCreateEvent, renderEditEvent } from "./views/eventForm.js";
import {
  formatCard, formatExpiry, onBookingAction,
  renderBookingConfirm, renderBookings, renderPayment,
} from "./views/bookings.js";
import { renderDashboard, renderPublish } from "./views/dashboard.js";
import { renderAdmin } from "./views/admin.js";
import { renderProfile } from "./views/profile.js";

// routes

route("events",         renderEvents);
route("detail",         renderDetail);
route("login",          renderLogin);
route("register",       renderRegister);
route("bookings",       renderBookings);
route("payment",        renderPayment);
route("bookingConfirm", renderBookingConfirm);
route("dashboard",      renderDashboard);
route("createEvent",    renderCreateEvent);
route("editEvent",      renderEditEvent);
route("publish",        renderPublish);
route("admin",          renderAdmin);
route("profile",        renderProfile);

// views render as HTML strings so a few fns have to be reachable from inline
// onclick/oninput. keep this list tiny.

Object.assign(window, { navigate, goToPage, clearFilters, formatCard, formatExpiry });

// boot

async function boot() {
  initRouter();

  // scoped to #app so it can't collide with the modal's data-act buttons in <body>
  appRoot.addEventListener("click", onBookingAction);

  document.getElementById("brand").onclick = () => navigate("events");
  setupHeaderSearch({ onApply: loadEvents });

  await initCsrf();
  try {
    const me = await get("/api/me");
    store.user = me.logged_in ? me : null;
  } catch {
    store.user = null;
  }

  // /api/me clears the session (and its cookie) when the session points at a
  // user row that no longer exists. that kills the csrf token we fetched
  // above, so re-sync before anything tries to write.
  await initCsrf();
  updateNav();

  readHash();
  render();
}

boot();
