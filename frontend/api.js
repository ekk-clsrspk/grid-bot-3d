export const API_BASE_URL = "https://0v0qtl4n8v.aek-lab.space";

const TOKEN_KEY = "gridBot3D.session.v1";
const USER_KEY = "gridBot3D.user.v1";

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = getToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("Unable to reach the server. Please try again.");
  }

  const body = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(body?.error?.message || "Request failed. Please try again.");
  }

  return body;
}

export async function registerAccount(payload) {
  const response = await apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  saveSession(response);
  return response.user;
}

export async function loginAccount(payload) {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  saveSession(response);
  return response.user;
}

export async function currentUser() {
  if (!getToken()) return null;
  try {
    const user = await apiRequest("/api/auth/me");
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    clearSession();
    return null;
  }
}

export async function requirePlayer() {
  const user = await currentUser();
  if (!user) {
    window.location.replace("/");
    return new Promise(() => {});
  }
  if (user.role === "admin") {
    window.location.replace("/admin");
    return new Promise(() => {});
  }
  return user;
}

export async function requireAdmin() {
  const user = await currentUser();
  if (!user) {
    window.location.replace("/");
    return new Promise(() => {});
  }
  if (user.role !== "admin") {
    window.location.replace("/");
    return new Promise(() => {});
  }
  return user;
}

export async function signOut() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    clearSession();
  }
}

export function cachedUser() {
  try {
    return JSON.parse(window.localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function saveSession(response) {
  window.localStorage.setItem(TOKEN_KEY, response.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(response.user));
}

function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
