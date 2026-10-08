/**
 * Header navigation, account chip, and the global search box.
 */

import { api, navRoot, store } from "./api.js";
import { navigate } from "./router.js";
import { toast } from "./ui.js";

/**
 * Initials for the avatar: "Aminul Islam" -> "AI", "sifat" -> "SI".
 * Falls back to the username when no real name is set.
 */
export function initialsFor(user) {
  if (!user) return "?";
  const source = (user.full_name || "").trim() || user.username || "?";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/** Rebuild the nav buttons for the current auth state. */
export function updateNav() {
  navRoot.innerHTML = "";
  const loggedIn = Boolean(store.user?.logged_in);

  const add = (label, onClick, className = "") => {
    const button = document.createElement("button");
    button.textContent = label;
    if (className) button.className = className;
    button.onclick = onClick;
    navRoot.appendChild(button);
    return button;
  };

  // Find Event — jump to the list and focus the search field
  add("Find Event", () => {
    if (store.view !== "events") navigate("events");
    document.getElementById("nav-search").focus();
  });

  // Create Event — open to everyone; drafts publish after the platform fee
  add("Create Event", () => {
    if (!loggedIn) {
      toast("Sign in to create an event", "error");
      return navigate("login");
    }
    navigate("createEvent");
  }, "accent");

  // My Tickets — always shown; the view itself redirects when logged out
  add("My Tickets", () => navigate("bookings"));

  if (loggedIn) {
    if (store.user.role === "admin") add("Admin", () => navigate("admin"));

    // Account chip: avatar + name, top-right, opens the profile page
    const chip = document.createElement("button");
    chip.className = "account-chip";
    chip.title = "View profile";
    chip.innerHTML = `
      <span class="avatar">${initialsFor(store.user)}</span>
      <span class="chip-name">${store.user.full_name?.split(" ")[0] || store.user.username}</span>`;
    chip.onclick = () => navigate("profile");
    navRoot.appendChild(chip);
  } else {
    add("Login", () => navigate("login"));
    add("Sign Up", () => navigate("register"));
  }
}

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------

let searchTimer;

/**
 * The search box lives in the header, so it must work from any view.
 * Typing anywhere routes you to the events list with the query applied.
 */
export function setupHeaderSearch({ onApply }) {
  const input = document.getElementById("nav-search");

  const apply = () => {
    store.query = input.value;
    store.page = 1;
    if (store.view !== "events") navigate("events");
    else onApply();
  };

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(apply, 300);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchTimer);
      apply();
    }
    if (e.key === "Escape") {
      input.value = "";
      input.blur();
    }
  });
}

/** Clear the search box and the stored query. */
export function clearSearch() {
  store.query = "";
  const input = document.getElementById("nav-search");
  if (input) input.value = "";
}
