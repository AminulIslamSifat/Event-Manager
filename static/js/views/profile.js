// profile: details, editing, password change

import { appRoot, post, put, store } from "../api.js";
import { navigate } from "../router.js";
import { toast } from "../ui.js";
import { esc, onEnter, setBusy, val } from "../utils.js";
import { initialsFor, updateNav } from "../nav.js";

let editing = false;

export function renderProfile() {
  if (!store.user?.logged_in) return navigate("login");
  editing = false;
  paint();
}

function paint() {
  const u = store.user;
  const joined = u.created_at ? String(u.created_at).split(" ")[0] : "";

  appRoot.innerHTML = `
    <div class="auth-wrap" style="max-width:620px;margin-top:0">

      <div class="profile-head">
        <div class="avatar-lg">${initialsFor(u)}</div>
        <div class="who">
          <h1 class="display">${esc(u.full_name || u.username)}</h1>
          <div class="handle">@${esc(u.username)} · <span style="text-transform:capitalize">${esc(u.role)}</span></div>
        </div>
      </div>

      <div class="subnav" id="profile-tabs">
        <button data-tab="details" class="${editing ? "" : "active"}">Details</button>
        <button data-tab="edit" class="${editing ? "active" : ""}">Edit profile</button>
        <button data-tab="security">Security</button>
      </div>

      <div id="profile-body"></div>
    </div>`;

  document.querySelectorAll("#profile-tabs button").forEach((btn) => {
    btn.onclick = () => {
      if (btn.dataset.tab === "edit") editing = true;
      else editing = false;
      paint();
      if (btn.dataset.tab === "security") setTimeout(() => document.getElementById("old-pw")?.focus(), 50);
    };
  });

  const body = document.getElementById("profile-body");
  if (editing) renderEditForm(body);
  else renderDetails(body, joined);
}

// read-only details

function detailItem(label, value) {
  const empty = !value;
  return `
    <div class="detail-item">
      <div class="k">${label}</div>
      <div class="v ${empty ? "empty" : ""}">${empty ? "Not set" : esc(value)}</div>
    </div>`;
}

function renderDetails(body, joined) {
  const u = store.user;

  body.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="detail-grid">
        ${detailItem("Full name", u.full_name)}
        ${detailItem("Username", u.username)}
        ${detailItem("Email", u.email)}
        ${detailItem("Phone", u.phone)}
        ${detailItem("City", u.city)}
        ${detailItem("Member since", joined)}
      </div>
      ${u.bio ? `<div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--line)">
        <div class="k" style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:0.4rem">About</div>
        <p style="font-size:0.88rem;color:var(--text-soft);line-height:1.6">${esc(u.bio)}</p>
      </div>` : ""}
    </div>

    <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
      <button class="primary" id="go-dashboard" style="flex:1">My events</button>
      <button class="ghost" id="go-bookings" style="flex:1">My tickets</button>
      <button class="ghost" id="do-logout">Log out</button>
    </div>`;

  document.getElementById("go-dashboard").onclick = () => navigate("dashboard");
  document.getElementById("go-bookings").onclick = () => navigate("bookings");
  document.getElementById("do-logout").onclick = async () => {
    const btn = document.getElementById("do-logout");
    setBusy(btn, true, "Logging out…");
    try {
      await post("/api/logout", {});
      store.user = null;
      updateNav();
      navigate("events");
    } catch {
      setBusy(btn, false);
    }
  };

  // security block sits under the details when not editing
  const sec = document.createElement("div");
  sec.style.marginTop = "1.5rem";
  body.appendChild(sec);
  renderSecurity(sec);
}

// edit form

function renderEditForm(body) {
  const u = store.user;

  body.innerHTML = `
    <div class="card">
      <div id="err" class="error"></div>

      <label class="field-label" for="e-name">Full name</label>
      <input id="e-name" value="${esc(u.full_name || "")}" placeholder="Aminul Islam">

      <label class="field-label" for="e-email">Email</label>
      <input id="e-email" type="email" value="${esc(u.email || "")}" placeholder="you@example.com">

      <div style="display:flex;gap:0.75rem">
        <div style="flex:1">
          <label class="field-label" for="e-phone">Phone</label>
          <input id="e-phone" value="${esc(u.phone || "")}" placeholder="01XXXXXXXXX">
        </div>
        <div style="flex:1">
          <label class="field-label" for="e-city">City</label>
          <input id="e-city" value="${esc(u.city || "")}" placeholder="Rajshahi">
        </div>
      </div>

      <label class="field-label" for="e-bio">About you</label>
      <textarea id="e-bio" rows="3" placeholder="A short bio">${esc(u.bio || "")}</textarea>

      <div style="display:flex;gap:0.6rem;margin-top:0.5rem">
        <button class="ghost" id="cancel-edit" style="flex:1">Cancel</button>
        <button class="primary" id="save-profile" style="flex:2">Save changes</button>
      </div>
    </div>`;

  document.getElementById("cancel-edit").onclick = () => { editing = false; paint(); };
  document.getElementById("save-profile").onclick = saveProfile;
}

async function saveProfile() {
  const errEl = document.getElementById("err");
  errEl.textContent = "";

  const payload = {
    full_name: val("e-name").trim(),
    email: val("e-email").trim(),
    phone: val("e-phone").trim(),
    city: val("e-city").trim(),
    bio: val("e-bio").trim(),
  };

  if (!payload.full_name) return void (errEl.textContent = "Full name is required");
  if (!payload.email)     return void (errEl.textContent = "Email is required");

  const btn = document.getElementById("save-profile");
  setBusy(btn, true, "Saving…");

  try {
    const result = await put("/api/profile", payload);
    store.user = { ...store.user, ...result.user };
    updateNav();                       // refresh the avatar initials
    toast("Profile updated");
    editing = false;
    paint();
  } catch (e) {
    setBusy(btn, false);
    errEl.textContent = e.message;
  }
}

// security / password change

function renderSecurity(container) {
  container.innerHTML = `
    <div class="card">
      <h2 style="font-size:1.05rem;margin-bottom:1.25rem">Change password</h2>
      <div id="pw-err" class="error"></div>

      <label class="field-label" for="old-pw">Current password</label>
      <input id="old-pw" type="password" placeholder="••••••••" autocomplete="current-password">

      <label class="field-label" for="new-pw">New password</label>
      <input id="new-pw" type="password" placeholder="at least 6 characters" autocomplete="new-password">

      <label class="field-label" for="new-pw2">Confirm new password</label>
      <input id="new-pw2" type="password" placeholder="repeat new password" autocomplete="new-password">

      <button class="primary" id="pw-btn" style="width:100%;margin-top:0.75rem">Update password</button>
    </div>`;

  document.getElementById("pw-btn").onclick = changePassword;
  ["old-pw", "new-pw", "new-pw2"].forEach((id) => onEnter(id, changePassword));
}

async function changePassword() {
  const errEl = document.getElementById("pw-err");
  errEl.textContent = "";

  const oldPassword = val("old-pw");
  const newPassword = val("new-pw");
  const confirmPassword = val("new-pw2");

  if (!oldPassword || !newPassword) return void (errEl.textContent = "Fill in all fields");
  if (newPassword !== confirmPassword) return void (errEl.textContent = "New passwords do not match");
  if (newPassword.length < 6) return void (errEl.textContent = "Password must be at least 6 characters");

  const btn = document.getElementById("pw-btn");
  setBusy(btn, true, "Updating…");

  try {
    await post("/api/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    setBusy(btn, false);
    toast("Password updated");
    ["old-pw", "new-pw", "new-pw2"].forEach((id) => { document.getElementById(id).value = ""; });
  } catch (e) {
    setBusy(btn, false);
    errEl.textContent = e.message;
  }
}
