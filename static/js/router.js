// hash router. views register themselves, navigate() updates the url then renders.

import { store } from "./api.js";

const routes = new Map();

// name -> render fn, gets the route param
export function route(name, renderFn) {
  routes.set(name, renderFn);
}

// go somewhere
export function navigate(view, param) {
  store.view = view;
  store.param = param;
  history.pushState({ view, param }, "", `#${view}${param !== undefined ? "/" + param : ""}`);
  render();
}

// repaint current view after data changed
export function render() {
  window.scrollTo({ top: 0 });
  const view = routes.get(store.view) || routes.get("events");
  view?.(store.param);
}

// #view/param -> store
export function readHash() {
  const parts = (location.hash.slice(1) || "events").split("/");
  store.view = parts[0] || "events";
  const raw = parts[1];
  store.param = raw === undefined ? null : (isNaN(raw) ? raw : parseInt(raw, 10));
}

// back/forward buttons
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