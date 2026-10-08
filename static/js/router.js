/**
 * Hash-based router.
 *
 * Views register themselves; `navigate()` updates the URL, then dispatches
 * to the matching render function.
 */

import { store } from "./api.js";

const routes = new Map();

/** Register a view: name -> render function (receives the route param). */
export function route(name, renderFn) {
  routes.set(name, renderFn);
}

/** Programmatic navigation. */
export function navigate(view, param) {
  store.view = view;
  store.param = param;
  history.pushState({ view, param }, "", `#${view}${param !== undefined ? "/" + param : ""}`);
  render();
}

/** Re-render the current view (used after in-place data changes). */
export function render() {
  window.scrollTo({ top: 0 });
  const view = routes.get(store.view) || routes.get("events");
  view?.(store.param);
}

/** Parse `#view/param` into the store. */
export function readHash() {
  const parts = (location.hash.slice(1) || "events").split("/");
  store.view = parts[0] || "events";
  const raw = parts[1];
  store.param = raw === undefined ? null : (isNaN(raw) ? raw : parseInt(raw, 10));
}

/** Wire up browser back/forward. */
export function initRouter() {
  window.addEventListener("popstate", (e) => {
    if (e.state) {
      store.view = e.state.view;
      store.param = e.state.param;
    } else {
      readHash();
    }
    render();
  });
}