/**
 * Application entry point.
 *
 * Wires the router, registers every view, restores the session, and exposes
 * the handful of helpers that appear in inline HTML attributes.
 */

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

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Globals
//
// Views are rendered as HTML strings, so a few functions must be reachable
// from inline onclick/oninput attributes. Keep this list as small as possible.
// ---------------------------------------------------------------------------

Object.assign(window, { navigate, goToPage, clearFilters, formatCard, formatExpiry });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  initRouter();

  // One delegated listener for booking-row buttons, scoped to #app so it
  // never collides with the confirm modal's own data-act buttons in <body>.
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
  updateNav();

  readHash();
  render();
}

boot();
