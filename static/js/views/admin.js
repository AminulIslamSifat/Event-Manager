// admin: stats, venue/artist management, csv export

import { appRoot, del, get, post, put, store, loadReferenceData } from "../api.js";
import { navigate } from "../router.js";
import { confirmModal, toast } from "../ui.js";
import { blockLoader, emptyState, esc, formatMoney, icon, setBusy, skeletonRows, val } from "../utils.js";

let tab = "overview";

export async function renderAdmin() {
  if (store.user?.role !== "admin") return navigate("events");

  appRoot.innerHTML = `
    <div class="view-head">
      <div class="eyebrow">Admin</div>
      <h1 class="display">Control room</h1>
    </div>
    <div class="subnav" id="admin-tabs">
      <button data-tab="overview">Overview</button>
      <button data-tab="venues">Venues</button>
      <button data-tab="artists">Artists</button>
    </div>
    <div id="admin-body"><div class="skeleton" style="height:280px"></div></div>`;

  document.querySelectorAll("#admin-tabs button").forEach((btn) => {
    btn.onclick = () => {
      tab = btn.dataset.tab;
      paintTabs();
      renderTab();
    };
  });

  paintTabs();
  renderTab();
}

function paintTabs() {
  document.querySelectorAll("#admin-tabs button").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === tab));
}

async function renderTab() {
  const box = document.getElementById("admin-body");
  if (box) box.innerHTML = skeletonRows(3);

  if (tab === "overview") return renderOverview();
  if (tab === "venues")   return renderVenues();
  if (tab === "artists")  return renderArtists();
}


async function renderOverview() {
  const box = document.getElementById("admin-body");

  try {
    const stats = await get("/api/admin/stats");

    const popular = stats.popular?.length
      ? `<div class="card" style="margin-top:1.5rem">
           <h3 style="font-size:0.95rem;margin-bottom:0.75rem">Top events</h3>
           ${stats.popular.map((p) => `
             <div class="summary-row" style="border-bottom:1px solid var(--line);padding:0.5rem 0">
               <span>${esc(p.title)}</span>
               <span class="tag">${p.sold} sold</span>
             </div>`).join("")}
         </div>`
      : "";

    box.innerHTML = `
      <div class="mini-stats">
        <div class="mini-stat"><div class="n">${stats.total_events}</div><div class="l">Events</div></div>
        <div class="mini-stat"><div class="n">${stats.published_events}</div><div class="l">Published</div></div>
        <div class="mini-stat"><div class="n">${stats.draft_events}</div><div class="l">Drafts</div></div>
        <div class="mini-stat"><div class="n">${stats.total_bookings}</div><div class="l">Bookings</div></div>
      </div>

      <div class="stats-grid">
        <div class="card stat-card">
          <div class="stat-value">${formatMoney(stats.revenue)}</div>
          <div class="stat-label">Ticket revenue</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${formatMoney(stats.production_spend)}</div>
          <div class="stat-label">Production spend</div>
        </div>
      </div>

      <button class="ghost" id="export-btn" style="width:100%;margin-top:0.5rem">
        ${icon("download", 15)} Export bookings CSV
      </button>

      ${popular}`;

    document.getElementById("export-btn").onclick = exportCsv;
  } catch {
    box.innerHTML = emptyState({ icon: "warning", message: "Could not load stats." });
  }
}

async function exportCsv() {
  const btn = document.getElementById("export-btn");
  setBusy(btn, true, "Exporting…");

  try {
    const res = await fetch("/api/admin/export-bookings", {
      headers: { "X-CSRF-Token": store.csrf },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bookings.csv";
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    setBusy(btn, false);
  }
}


async function renderVenues() {
  const box = document.getElementById("admin-body");
  box.innerHTML = blockLoader("Loading venues…");

  let venues;
  try {
    await loadReferenceData({ force: true });
    venues = await get("/api/venues?all=1");
  } catch {
    box.innerHTML = emptyState({ icon: "warning", message: "Could not load venues." });
    return;
  }

  box.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem">
      <h3 style="font-size:0.95rem;margin-bottom:1rem">Add a venue</h3>
      <input id="v-name" placeholder="Venue name">
      <input id="v-address" placeholder="Address / area (e.g. Mirpur, Dhaka)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem">
        <input id="v-capacity" type="number" placeholder="Capacity">
        <input id="v-fee" type="number" placeholder="Fee (৳)">
      </div>
      <button class="primary" id="v-add" style="width:100%">Add venue</button>
    </div>

    <div class="card">
      <table class="ref-table">
        <thead>
          <tr><th>Venue</th><th>Location</th><th class="num">Capacity</th><th class="num">Fee</th><th></th></tr>
        </thead>
        <tbody>
          ${venues.map((v) => `
            <tr>
              <td>${esc(v.name)}${v.active ? "" : ' <span class="pill draft">Hidden</span>'}</td>
              <td class="muted">${esc(v.address || "—")}</td>
              <td class="num">${v.capacity.toLocaleString("en-IN")}</td>
              <td class="num">${formatMoney(v.fee)}</td>
              <td style="text-align:right">
                <button class="ghost" data-edit-venue="${v.id}"
                        style="padding:0.3rem 0.6rem;font-size:0.75rem">Edit</button>
                <button class="danger" data-del-venue="${v.id}"
                        style="padding:0.3rem 0.6rem;font-size:0.75rem">Delete</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  document.getElementById("v-add").onclick = async () => {
    const btn = document.getElementById("v-add");
    setBusy(btn, true, "Adding…");
    try {
      await post("/api/venues", {
        name: val("v-name"),
        address: val("v-address"),
        capacity: Number(val("v-capacity")) || 0,
        fee: Number(val("v-fee")) || 0,
      });
      toast("Venue added");
      renderVenues();
    } catch (e) {
      setBusy(btn, false);
      toast(e.message, "error");
    }
  };

  box.querySelectorAll("[data-edit-venue]").forEach((btn) => {
    btn.onclick = () => editVenue(venues.find((v) => v.id === Number(btn.dataset.editVenue)));
  });

  box.querySelectorAll("[data-del-venue]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await confirmModal("Delete venue", "Venues used by an event are hidden instead of removed.");
      if (!ok) return;
      setBusy(btn, true, "…");
      try {
        await del(`/api/venues/${btn.dataset.delVenue}`);
        toast("Venue removed");
        renderVenues();
      } catch (e) {
        setBusy(btn, false);
        toast(e.message, "error");
      }
    };
  });
}

async function editVenue(venue) {
  if (!venue) return;
  const name = prompt("Venue name", venue.name);
  if (name === null) return;
  const address = prompt("Address / area", venue.address || "");
  if (address === null) return;
  const capacity = prompt("Capacity", venue.capacity);
  if (capacity === null) return;
  const fee = prompt("Fee (BDT)", venue.fee);
  if (fee === null) return;

  try {
    await put(`/api/venues/${venue.id}`, {
      name,
      address,
      capacity: Number(capacity) || 0,
      fee: Number(fee) || 0,
      active: Boolean(venue.active),
    });
    toast("Venue updated");
    renderVenues();
  } catch (e) {
    toast(e.message, "error");
  }
}


async function renderArtists() {
  const box = document.getElementById("admin-body");
  box.innerHTML = blockLoader("Loading artists…");

  let artists;
  try {
    artists = await get("/api/artists?all=1");
  } catch {
    box.innerHTML = emptyState({ icon: "warning", message: "Could not load artists." });
    return;
  }

  box.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem">
      <h3 style="font-size:0.95rem;margin-bottom:1rem">Add an artist</h3>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.6rem">
        <input id="a-name" placeholder="Artist / band name">
        <input id="a-genre" placeholder="Genre">
        <input id="a-fee" type="number" placeholder="Fee (৳)">
      </div>
      <button class="primary" id="a-add" style="width:100%">Add artist</button>
    </div>

    <div class="card">
      <table class="ref-table">
        <thead>
          <tr><th>Artist</th><th>Genre</th><th class="num">Fee</th><th></th></tr>
        </thead>
        <tbody>
          ${artists.map((a) => `
            <tr>
              <td>${esc(a.name)}${a.active ? "" : ' <span class="pill draft">Hidden</span>'}</td>
              <td class="muted">${esc(a.genre || "—")}</td>
              <td class="num">${formatMoney(a.fee)}</td>
              <td style="text-align:right">
                <button class="ghost" data-edit-artist="${a.id}"
                        style="padding:0.3rem 0.6rem;font-size:0.75rem">Edit</button>
                <button class="danger" data-del-artist="${a.id}"
                        style="padding:0.3rem 0.6rem;font-size:0.75rem">Delete</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  document.getElementById("a-add").onclick = async () => {
    const btn = document.getElementById("a-add");
    setBusy(btn, true, "Adding…");
    try {
      await post("/api/artists", {
        name: val("a-name"),
        genre: val("a-genre"),
        fee: Number(val("a-fee")) || 0,
      });
      toast("Artist added");
      renderArtists();
    } catch (e) {
      setBusy(btn, false);
      toast(e.message, "error");
    }
  };

  box.querySelectorAll("[data-edit-artist]").forEach((btn) => {
    btn.onclick = () => editArtist(artists.find((a) => a.id === Number(btn.dataset.editArtist)));
  });

  box.querySelectorAll("[data-del-artist]").forEach((btn) => {
    btn.onclick = async () => {
      const ok = await confirmModal("Delete artist", "Artists already on a lineup are hidden instead of removed.");
      if (!ok) return;
      setBusy(btn, true, "…");
      try {
        await del(`/api/artists/${btn.dataset.delArtist}`);
        toast("Artist removed");
        renderArtists();
      } catch (e) {
        setBusy(btn, false);
        toast(e.message, "error");
      }
    };
  });
}

async function editArtist(artist) {
  if (!artist) return;
  const name = prompt("Artist name", artist.name);
  if (name === null) return;
  const genre = prompt("Genre", artist.genre || "");
  if (genre === null) return;
  const fee = prompt("Fee (BDT)", artist.fee);
  if (fee === null) return;

  try {
    await put(`/api/artists/${artist.id}`, {
      name,
      genre,
      fee: Number(fee) || 0,
      active: Boolean(artist.active),
    });
    toast("Artist updated");
    renderArtists();
  } catch (e) {
    toast(e.message, "error");
  }
}
