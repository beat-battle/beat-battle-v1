/**
 * Token in localStorage, fetch wrappers, the boring stuff.
 */
import { getApiBase } from "./apiOrigin.js";

const TOKEN_KEY = "cookup_token";
const USERNAME_KEY = "cookup_username";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)?.trim() || "";
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY)?.trim() || "";
}

export function setAuthSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function authHeaders() {
  const t = getToken();
  const h = { "Content-Type": "application/json" };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export function authHeadersMultipart() {
  const t = getToken();
  const h = {};
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** No Content-Type — fine for /me-style GETs. */
export function authBearerOnly() {
  const t = getToken();
  const h = {};
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export function isLoggedIn() {
  return Boolean(getToken());
}

/** 401 = session cleared. Random network fail = keep token and hope. */
export async function validateSession() {
  const t = getToken();
  if (!t) return false;
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/me`, { headers: authBearerOnly() });
    if (res.status === 401) {
      clearAuthSession();
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function registerUser(username, password) {
  const base = getApiBase();
  const res = await fetch(`${base}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || res.statusText || "Register failed");
  }
  return data;
}

export async function loginUser(username, password) {
  const base = getApiBase();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : data.detail?.[0]?.msg || res.statusText || "Login failed",
    );
  }
  if (!data.token || !data.username) throw new Error("Invalid login response.");
  setAuthSession(data.token, data.username);
  return data;
}

export async function fetchLeaderboard() {
  const base = getApiBase();
  const res = await fetch(`${base}/leaderboard`);
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}

/** /me — who am I? Needs Bearer. */
export async function fetchMe() {
  const base = getApiBase();
  const res = await fetch(`${base}/me`, { headers: authBearerOnly() });
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}
