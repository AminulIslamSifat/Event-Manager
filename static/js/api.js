/**
 * API client + global application state.
 *
 * Every network call goes through `api()` so CSRF headers, JSON parsing and
 * error normalisation live in exactly one place.
 */

export const store = {
  user: null,          // { id, username, role, logged_in } | null
  csrf: "",
  view: "events",
  param: null,
  lastBooking: null,

  // events list filters
  query: "",
  category: "All",
  sort: "date_asc",
  page: 1,

  // cached reference data
  venues: [],
  artists: [],
};

export const appRoot = document.getElementById("app");
export const navRoot = document.getElementById("nav-links");

/** Fetch a fresh CSRF token and remember it. */
export async function initCsrf() {
  const res = await fetch("/api/csrf");
  store.csrf = (await res.json()).token;
}

/**
 * Perform an API request.
 * Throws an Error carrying the server's message on any non-2xx response.
 */
export async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": store.csrf,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

/** Convenience wrappers. */
export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
export const put = (path, body) => api(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path) => api(path, { method: "DELETE" });

/** Load venues + artists once and cache them in the store. */
export async function loadReferenceData({ force = false } = {}) {
  if (!force && store.venues.length && store.artists.length) return;
  const [venues, artists] = await Promise.all([get("/api/venues"), get("/api/artists")]);
  store.venues = venues;
  store.artists = artists;
}