// api client + global state.
// every call goes through api() so csrf headers and error handling live in one spot.

export const store = {
  user: null,
  csrf: "",
  view: "events",
  param: null,
  lastBooking: null,

  // filters
  query: "",
  category: "All",
  sort: "date_asc",
  page: 1,

  // cached
  venues: [],
  artists: [],
};

export const appRoot = document.getElementById("app");
export const navRoot = document.getElementById("nav-links");

// grab a csrf token
export async function initCsrf() {
  const res = await fetch("/api/csrf");
  store.csrf = (await res.json()).token;
}

// api request. throws with the server's message on any non-2xx.
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

// wrappers
export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
export const put = (path, body) => api(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path) => api(path, { method: "DELETE" });

// venues + artists, cached in store
export async function loadReferenceData({ force = false } = {}) {
  if (!force && store.venues.length && store.artists.length) return;
  const [venues, artists] = await Promise.all([get("/api/venues"), get("/api/artists")]);
  store.venues = venues;
  store.artists = artists;
}