// public/api.js
// Small helpers for the login token, shared by all pages.
// Loaded with a <script> tag BEFORE the page's own script.

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

// ---------- Token storage (localStorage) ----------

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Save the token and the user (id + email) after a successful login
function saveLogin(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Get the saved user, e.g. { id: '...', email: 'ana@mail.com' }, or null
function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch (e) {
    return null;
  }
}

// Forget everything about the login (used by Logout and when the token is rejected)
function clearLogin() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function goToLogin() {
  window.location.href = 'login.html';
}

// ---------- fetch wrapper ----------
// Use this instead of fetch() for every call to a protected API route.
// 1. It adds the header  "Authorization: Bearer <token>"
// 2. If the server answers 401 (no/invalid/expired token), the login is no
//    longer valid: we remove the token and send the user to the login page.
async function authFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearLogin();
    goToLogin();
    // Stop the calling code here: the page is about to change anyway
    throw new Error('Your session has ended. Please log in again.');
  }

  return response;
}
