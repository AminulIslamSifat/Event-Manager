// login + register.
// signup collects the profile fields up front so the profile page isn't empty.

import { appRoot, post, store } from "../api.js";
import { navigate } from "../router.js";
import { toast } from "../ui.js";
import { onEnter, setBusy, val } from "../utils.js";
import { updateNav } from "../nav.js";


export function renderLogin() {
  appRoot.innerHTML = `
    <div class="auth-wrap">
      <h1 class="display">Welcome back</h1>
      <p class="sub">Sign in to book tickets and manage your events.</p>
      <div class="card">
        <div id="err" class="error"></div>
        <label class="field-label" for="u">Username</label>
        <input id="u" placeholder="your username" autocomplete="username">
        <label class="field-label" for="p">Password</label>
        <input id="p" type="password" placeholder="••••••••" autocomplete="current-password">
        <button class="primary" style="width:100%;margin-top:0.5rem" id="login-btn">Sign in</button>
        <p class="form-links">No account? <a id="to-register">Create one</a></p>
      </div>
    </div>`;

  document.getElementById("login-btn").onclick = doLogin;
  document.getElementById("to-register").onclick = () => navigate("register");
  onEnter("u", doLogin);
  onEnter("p", doLogin);
}

async function doLogin() {
  const username = val("u").trim();
  const password = val("p");
  const errEl = document.getElementById("err");

  if (!username || !password) {
    errEl.textContent = "Fill in both fields";
    return;
  }

  const btn = document.getElementById("login-btn");
  setBusy(btn, true, "Signing in…");

  try {
    const user = await post("/api/login", { username, password });
    store.user = { ...user, logged_in: true };
    updateNav();
    toast(`Welcome back, ${user.full_name || user.username}`);
    navigate("events");
  } catch (e) {
    setBusy(btn, false);
    errEl.textContent = e.message;
  }
}


export function renderRegister() {
  appRoot.innerHTML = `
    <div class="auth-wrap" style="max-width:480px">
      <h1 class="display">Create your account</h1>
      <p class="sub">Book tickets, host events, and manage everything in one place.</p>

      <div class="card">
        <div id="err" class="error"></div>

        <label class="field-label" for="full_name">Full name</label>
        <input id="full_name" placeholder="Aminul Islam" autocomplete="name">

        <label class="field-label" for="u">Username</label>
        <input id="u" placeholder="letters, numbers, underscores" autocomplete="username">

        <label class="field-label" for="email">Email</label>
        <input id="email" type="email" placeholder="you@example.com" autocomplete="email">

        <div style="display:flex;gap:0.75rem">
          <div style="flex:1">
            <label class="field-label" for="phone">Phone <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
            <input id="phone" placeholder="01XXXXXXXXX" autocomplete="tel">
          </div>
          <div style="flex:1">
            <label class="field-label" for="city">City <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
            <input id="city" placeholder="Rajshahi" autocomplete="address-level2">
          </div>
        </div>

        <label class="field-label" for="p">Password</label>
        <input id="p" type="password" placeholder="at least 6 characters" autocomplete="new-password">

        <label class="field-label" for="p2">Confirm password</label>
        <input id="p2" type="password" placeholder="repeat your password" autocomplete="new-password">
        <div id="match-hint" class="muted" style="font-size:0.75rem;margin-top:-0.4rem;min-height:1rem"></div>

        <button class="primary" style="width:100%;margin-top:0.75rem" id="reg-btn">Create account</button>
        <p class="form-links">Already registered? <a id="to-login">Sign in</a></p>
      </div>
    </div>`;

  document.getElementById("reg-btn").onclick = doRegister;
  document.getElementById("to-login").onclick = () => navigate("login");

  // live password match hint
  const pw = document.getElementById("p");
  const pw2 = document.getElementById("p2");
  const hint = document.getElementById("match-hint");

  const checkMatch = () => {
    if (!pw2.value) {
      hint.textContent = "";
      hint.style.color = "";
      return;
    }
    const match = pw.value === pw2.value;
    hint.textContent = match ? "✓ Passwords match" : "✗ Passwords do not match";
    hint.style.color = match ? "var(--success)" : "var(--danger)";
  };

  pw.addEventListener("input", checkMatch);
  pw2.addEventListener("input", checkMatch);

  ["full_name", "u", "email", "phone", "city", "p", "p2"].forEach((id) => onEnter(id, doRegister));
  document.getElementById("full_name").focus();
}

async function doRegister() {
  const errEl = document.getElementById("err");
  errEl.textContent = "";

  const payload = {
    full_name: val("full_name").trim(),
    username: val("u").trim(),
    email: val("email").trim(),
    phone: val("phone").trim(),
    city: val("city").trim(),
    password: val("p"),
    confirm_password: val("p2"),
  };

  // cheap checks first so obvious mistakes don't hit the network
  if (!payload.full_name) return void (errEl.textContent = "Enter your full name");
  if (!payload.username)  return void (errEl.textContent = "Choose a username");
  if (!payload.email)     return void (errEl.textContent = "Enter your email");
  if (!payload.password)  return void (errEl.textContent = "Choose a password");
  if (payload.password !== payload.confirm_password) {
    return void (errEl.textContent = "Passwords do not match");
  }

  const btn = document.getElementById("reg-btn");
  setBusy(btn, true, "Creating account…");

  try {
    await post("/api/register", payload);
    toast("Account created — please sign in");
    navigate("login");
  } catch (e) {
    setBusy(btn, false);
    errEl.textContent = e.message;
  }
}
