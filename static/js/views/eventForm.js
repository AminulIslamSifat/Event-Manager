// create/edit event form. fields left, sticky budget panel right.
// saves as a draft, goes live once the platform fee is paid.

import { appRoot, get, post, put, store, loadReferenceData } from "../api.js";
import { navigate } from "../router.js";
import { toast } from "../ui.js";
import { esc, checked, icon, setBusy, spinner, val, formatMoney } from "../utils.js";
import { artistPickerHtml, wireArtistPicker } from "../components/artistPicker.js";
import {
  allocatedSeats, readTiers, tierEditorHtml, tierRow, updateTierMeter, wireTierEditor,
} from "../components/tierEditor.js";
import {
  refreshBudget, wireBudgetInputs, selectedArtistIds,
} from "../components/budgetPanel.js";

const CATEGORIES = ["General", "Tech", "Music", "Art", "Sports", "Food", "Education"];

// price + pool come from the tier list.
//   price = cheapest tier (the "from ৳X" shown on cards)
//   pool  = total seats allocated across tiers
function derivePricing() {
  const tiers = readTiers();
  if (!tiers.length) return { price: 0, tickets: 0 };
  return {
    price: Math.min(...tiers.map((t) => t.price)),
    tickets: tiers.reduce((sum, t) => sum + t.quantity, 0),
  };
}

// form -> api payload
function collectPayload() {
  return {
    // basics
    title: val("f-title"),
    description: val("f-desc"),
    category: val("f-cat"),
    date: val("f-date"),
    location: val("f-venue-name"),   // venue IS the location
    image_url: val("f-img"),

    // venue
    venue_id: Number(val("f-venue")) || null,
    venue_name: val("f-venue-name"),
    venue_fee: Number(val("f-venue-fee")) || 0,
    venue_capacity: Number(val("f-capacity")) || 0,

    // money
    organizer_costs: Number(val("f-organizer")) || 0,
    admin_margin: Number(val("f-margin")) || 0,
    sponsorship: Number(val("f-sponsor")) || 0,

    // lineup
    artist_ids: selectedArtistIds(),

    // ticketing. price and pool are DERIVED from the tiers -- there is no
    // standalone price field any more. the server recomputes both anyway;
    // these are sent so validation can run before the request.
    ...derivePricing(),
    tiers: readTiers(),

    // optional safety
    has_smoke_detector: checked("f-smoke"),
    has_drug_detector: checked("f-drug"),
    security_notes: val("f-security-notes"),
  };
}

// venue options, marks the current one
function venueOptions(selectedId) {
  return `<option value="">— Choose a venue —</option>` +
    store.venues.map((v) => `
      <option value="${v.id}"
              data-fee="${v.fee}"
              data-capacity="${v.capacity}"
              data-name="${esc(v.name)}"
              data-address="${esc(v.address || "")}"
              ${v.id === selectedId ? "selected" : ""}>
        ${esc(v.name)}${v.address ? " — " + esc(v.address) : ""} · ${v.capacity.toLocaleString("en-IN")} seats · ${formatMoney(v.fee)}
      </option>`).join("");
}

// event is {} for create, populated for edit
function formHtml(event = {}) {
  const isEdit = Boolean(event.id);
  const categoryOptions = CATEGORIES
    .map((c) => `<option value="${c}" ${(event.category || "General") === c ? "selected" : ""}>${c}</option>`)
    .join("");

  return `
    <button class="back-btn" id="form-back">${icon("chevronLeft", 15)} Back</button>

    <div class="view-head">
      <div class="eyebrow">${isEdit ? "Editing" : "New production"}</div>
      <h1 class="display">${isEdit ? esc(event.title || "Event") : "Create an event"}</h1>
      <p class="sub">
        Build the budget, pick the lineup, and split the seats into tiers.
        ${isEdit ? "" : "Your event is saved as a draft until you publish it."}
      </p>
    </div>

    <div class="form-layout">
      <div>
        <!-- 1. Basics -->
        <section class="form-section">
          <h3><span class="step">1</span> Event details</h3>
          <label class="field-label">Title</label>
          <input id="f-title" placeholder="Event name" value="${esc(event.title || "")}">

          <label class="field-label">Description</label>
          <textarea id="f-desc" rows="4" placeholder="What should people expect?">${esc(event.description || "")}</textarea>

          <label class="field-label">Category</label>
          <select id="f-cat">${categoryOptions}</select>

          <label class="field-label">Date &amp; time</label>
          <input id="f-date" type="datetime-local" value="${esc(event.date || "")}">

          <label class="field-label">Cover image <span style="text-transform:none;letter-spacing:0">(optional — a default is used otherwise)</span></label>
          <input type="hidden" id="f-img" value="${esc(event.image_is_default ? "" : (event.image_url || ""))}">
          <div class="upload-row">
            <input type="file" id="f-image-file" accept="image/png,image/jpeg,image/webp,image/gif">
            <button type="button" class="ghost" id="f-image-clear" style="display:none">Remove</button>
          </div>
          <div id="f-image-status" class="muted" style="font-size:0.75rem;margin-top:0.35rem"></div>
          <img id="f-image-preview" class="upload-preview" alt=""
               src="${esc(event.image_is_default ? "" : (event.image_url || ""))}"
               style="${event.image_is_default || !event.image_url ? "display:none" : ""}">
        </section>

        <!-- 2. Venue -->
        <section class="form-section">
          <h3><span class="step">2</span> Venue</h3>
          <label class="field-label">Pick a venue</label>
          <select id="f-venue">${venueOptions(event.venue_id)}</select>
          <div id="venue-location" class="muted" style="font-size:0.78rem;margin:-0.35rem 0 0.85rem"></div>

          <div style="display:flex;gap:0.75rem">
            <div style="flex:2">
              <label class="field-label">Venue name</label>
              <input id="f-venue-name" placeholder="Venue name" value="${esc(event.venue_name || "")}">
            </div>
            <div style="flex:1">
              <label class="field-label">Capacity</label>
              <input id="f-capacity" type="number" min="0" placeholder="20000"
                     value="${event.venue_capacity || ""}">
            </div>
          </div>

          <label class="field-label">Venue fee (৳)</label>
          <input id="f-venue-fee" type="number" min="0" step="1000" placeholder="200000"
                 value="${event.venue_fee || ""}">
        </section>

        <!-- 3. Lineup -->
        <section class="form-section">
          <h3><span class="step">3</span> Artist lineup</h3>
          ${artistPickerHtml((event.artists || []).map((a) => a.artist_id))}
        </section>

        <!-- 4. Costs -->
        <section class="form-section">
          <h3><span class="step">4</span> Costs &amp; sponsorship</h3>
          <div style="display:flex;gap:0.75rem">
            <div style="flex:1">
              <label class="field-label">Organizer costs (৳)</label>
              <input id="f-organizer" type="number" min="0" step="1000" placeholder="0"
                     value="${event.organizer_costs || ""}">
            </div>
            <div style="flex:1">
              <label class="field-label">Your margin (৳)</label>
              <input id="f-margin" type="number" min="0" step="1000" placeholder="0"
                     value="${event.admin_margin || ""}">
            </div>
          </div>

          <label class="field-label">Sponsorship received (৳)</label>
          <input id="f-sponsor" type="number" min="0" step="1000" placeholder="0"
                 value="${event.sponsorship || ""}">
        </section>

        <!-- 5. Tickets -->
        <section class="form-section">
          <h3><span class="step">5</span> Tickets</h3>
          <p class="section-hint">
            Seats come from the venue. Split them into tiers — every ticket belongs to one.
          </p>

          <div id="tier-suggestions" style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;margin-bottom:0.85rem"></div>
          ${tierEditorHtml(event.tiers || [])}
        </section>

        <!-- 6. Safety -->
        <section class="form-section">
          <h3><span class="step">6</span> Security &amp; safety</h3>
          <div class="toggle-row">
            <div>
              <div class="label">Smoke detectors</div>
              <div class="hint">Venue equipped with smoke detection</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="f-smoke" ${event.has_smoke_detector ? "checked" : ""}>
              <span class="track"></span>
            </label>
          </div>
          <div class="toggle-row">
            <div>
              <div class="label">Drug detectors</div>
              <div class="hint">Screening at entry points</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="f-drug" ${event.has_drug_detector ? "checked" : ""}>
              <span class="track"></span>
            </label>
          </div>
          <label class="field-label" style="margin-top:0.85rem">Additional security notes</label>
          <input id="f-security-notes" placeholder="e.g. 40 guards, 2 medical tents"
                 value="${esc(event.security_notes || "")}">
        </section>

        <button class="primary" id="submit-btn" style="width:100%">
          ${isEdit ? "Save changes" : "Create event"}
        </button>
        <div id="err" class="error" style="margin-top:0.75rem"></div>
      </div>

      <!-- Live budget panel -->
      <aside>
        <div class="budget-panel" id="budget-panel">
          <h3>Budget breakdown</h3>
          <p class="muted" style="font-size:0.8rem">Fill in the venue and lineup to see pricing.</p>
        </div>
      </aside>
    </div>`;
}

// the "this venue is located at ..." line
function showVenueLocation(name, address) {
  const el = document.getElementById("venue-location");
  if (!el) return;
  if (!name) {
    el.textContent = "";
    return;
  }
  el.innerHTML = `${icon("pin", 13)} <strong style="color:var(--text-soft)">${esc(name)}</strong>` +
                 (address ? ` — ${esc(address)}` : "");
}

// cover image picker.
// uploads on pick, drops the url into hidden #f-img so the rest of the form
// never has to deal with files.
function wireImageUpload() {
  const fileInput = document.getElementById("f-image-file");
  const hidden = document.getElementById("f-img");
  const clearBtn = document.getElementById("f-image-clear");
  const preview = document.getElementById("f-image-preview");
  const status = document.getElementById("f-image-status");
  if (!fileInput || !hidden) return;

  const showPreview = (url) => {
    if (url) {
      preview.src = url;
      preview.style.display = "";
      clearBtn.style.display = "";
    } else {
      preview.removeAttribute("src");
      preview.style.display = "none";
      clearBtn.style.display = "none";
    }
  };

  showPreview(hidden.value);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    status.style.color = "";
    status.innerHTML = `${spinner(12)} Uploading…`;
    fileInput.disabled = true;

    const body = new FormData();
    body.append("image", file);

    try {
      const res = await fetch("/api/events/upload-image", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      hidden.value = data.image_url;
      showPreview(data.image_url);
      status.style.color = "var(--success)";
      status.textContent = "Uploaded";
    } catch (err) {
      status.style.color = "var(--danger)";
      status.textContent = err.message;
      fileInput.value = "";
    } finally {
      fileInput.disabled = false;
    }
  });

  clearBtn.addEventListener("click", () => {
    hidden.value = "";
    fileInput.value = "";
    status.textContent = "";
    showPreview("");
  });
}

// venue dropdown autofills fee/capacity/name
function wireVenueSelect() {
  const select = document.getElementById("f-venue");
  if (!select) return;

  select.addEventListener("change", () => {
    const opt = select.selectedOptions[0];
    if (!opt || !opt.value) return;

    document.getElementById("f-venue-fee").value = opt.dataset.fee || 0;
    document.getElementById("f-capacity").value = opt.dataset.capacity || 0;
    document.getElementById("f-venue-name").value = opt.dataset.name || "";

    // seats are the venue's, so hand the whole capacity to a lone empty tier.
    // once there is more than one tier the organiser is splitting on purpose
    // and we leave their numbers alone.
    const capacity = Number(opt.dataset.capacity) || 0;
    const rows = [...document.querySelectorAll("#tier-editor .tier-row")];
    if (rows.length === 1 && capacity) {
      const qty = rows[0].querySelector(".tier-qty");
      if (qty && !qty.value) qty.value = capacity;
    }

    showVenueLocation(opt.dataset.name, opt.dataset.address);
    refreshTierMeter();

    // venue affects the budget, tell the panel
    document.getElementById("f-venue-fee").dispatchEvent(new Event("input"));
    document.getElementById("f-capacity").dispatchEvent(new Event("input"));
  });
}

// the meter tracks capacity, so it has to repaint on both tier and venue edits
function refreshTierMeter() {
  const cap = Number(val("f-capacity")) || 0;
  updateTierMeter(cap);
}

// shared by create + edit
async function mountForm(event = {}) {
  appRoot.innerHTML = `<div class="block-loader">${spinner(22)}<span>Loading form…</span></div>`;
  await loadReferenceData();
  appRoot.innerHTML = formHtml(event);

  wireVenueSelect();
  wireArtistPicker();

  // editing: show the stored venue/location
  if (event?.id) showVenueLocation(event.venue_name || event.location, "");

  // a fresh event starts with one tier holding the whole room. the organiser
  // adds tiers to split it, rather than starting from an empty list.
  const editor = document.getElementById("tier-editor");
  if (editor && !editor.querySelector(".tier-row")) {
    editor.insertAdjacentHTML("beforeend", tierRow({ name: "Regular" }));
  }

  wireImageUpload();

  const panel = document.getElementById("budget-panel");
  const recalc = wireBudgetInputs(panel, {
    onRecalculate: () => renderQuickAddChips(event),
  });

  // wired AFTER recalc exists -- the callback closes over it
  wireTierEditor({ onAllocationChange: () => { refreshTierMeter(); recalc?.(); } });
  refreshTierMeter();

  document.getElementById("form-back").onclick = () => navigate("dashboard");

  // first paint
  await refreshBudget(panel);

  return recalc;
}

// quick-add chips.
//
// prices are relative to the cheapest tier the organiser has ALREADY priced --
// not to the server's break-even figure. break-even is net/capacity, so with no
// prices entered yet it collapses to a near-zero number and the chips end up
// offering nonsense like "VIP BDT 12".
function renderQuickAddChips(event) {
  if (event?.id) return;                      // editing: leave the lineup alone
  const box = document.getElementById("tier-suggestions");
  if (!box) return;

  const priced = readTiers().map((t) => t.price).filter((p) => p > 0);
  const anchor = priced.length ? Math.min(...priced) : 0;
  const round = (n) => Math.round(n);

  const chip = (name, price) => {
    const label = price > 0 ? `${name} ৳${price}` : name;
    return `<button type="button" class="ghost" data-tier="${name}" data-price="${price || ""}"
                    style="padding:0.25rem 0.6rem;font-size:0.75rem">${label}</button>`;
  };

  box.innerHTML = `<span class="muted" style="font-size:0.75rem">Quick add:</span>`
    + chip("Regular", round(anchor))
    + chip("VIP", round(anchor * 2))
    + chip("Student", round(anchor * 0.6));

  box.querySelectorAll("button[data-tier]").forEach((btn) => {
    btn.onclick = () => {
      // only claim seats that are actually free. if the venue is fully
      // allocated this stays blank and the meter shows 0 remaining, which is
      // the honest answer -- the organiser has to free seats up first.
      const remaining = Math.max(0, (Number(val("f-capacity")) || 0) - allocatedSeats());

      document.getElementById("tier-editor").insertAdjacentHTML("beforeend", tierRow({
        name: btn.dataset.tier,
        price: btn.dataset.price,
        quantity: remaining || "",
      }));
      refreshTierMeter();
      document.getElementById("f-capacity").dispatchEvent(new Event("input"));
    };
  });
}

// mirrors the server's rules so mistakes are caught before the request.
// the server validates independently anyway.
function validatePayload(p) {
  if (!p.title.trim())       return "Title is required";
  if (!p.description.trim()) return "Description is required";
  if (!p.date)               return "Pick a date and time";
  if (!p.location.trim())    return "Pick a venue — it sets the location";

  if (!p.tiers.length) return "Add at least one ticket tier";

  const nameless = p.tiers.find((t) => !t.name.trim());
  if (nameless) return "Every ticket tier needs a name";

  const empty = p.tiers.find((t) => (t.quantity || 0) < 1);
  if (empty) return `Tier '${empty.name}' needs at least 1 seat`;

  // p.tickets is the sum of the tiers, so comparing the two was a tautology.
  // the real limit is the venue.
  if (p.venue_capacity > 0 && p.tickets > p.venue_capacity) {
    return `Allocated ${p.tickets.toLocaleString()} seats but the venue holds ${p.venue_capacity.toLocaleString()}`;
  }

  return null;
}

export async function renderCreateEvent() {
  if (!store.user?.logged_in) return navigate("login");
  await mountForm();

  document.getElementById("submit-btn").onclick = async () => {
    const errEl = document.getElementById("err");
    errEl.textContent = "";

    const payload = collectPayload();

    const problem = validatePayload(payload);
    if (problem) {
      errEl.textContent = problem;
      errEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const btn = document.getElementById("submit-btn");
    setBusy(btn, true, "Creating…");

    try {
      const result = await post("/api/events", payload);
      toast("Event created — pay the platform fee to publish");
      navigate("publish", result.id);
    } catch (e) {
      setBusy(btn, false);
      errEl.textContent = e.message;
      errEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
}

export async function renderEditEvent(id) {
  if (!store.user?.logged_in) return navigate("login");

  let event;
  try {
    event = await get(`/api/events/${id}`);
  } catch {
    appRoot.innerHTML = `<div class="empty-state"><p>Event not found.</p></div>`;
    return;
  }

  await mountForm(event);

  document.getElementById("submit-btn").onclick = async () => {
    const errEl = document.getElementById("err");
    errEl.textContent = "";

    const payload = collectPayload();

    const problem = validatePayload(payload);
    if (problem) {
      errEl.textContent = problem;
      errEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const btn = document.getElementById("submit-btn");
    setBusy(btn, true, "Saving…");

    try {
      await put(`/api/events/${id}`, payload);
      toast("Event updated");
      navigate("dashboard");
    } catch (e) {
      setBusy(btn, false);
      errEl.textContent = e.message;
      errEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
}