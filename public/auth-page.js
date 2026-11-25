// public/auth-page.js
// Shared script for login.html and register.html.
// The <form data-mode="login|register"> attribute tells us which page we are on.

const form = document.getElementById('auth-form');
const mode = form.dataset.mode; // "login" or "register"
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('auth-submit');
const errorsEl = document.getElementById('auth-errors');
const successEl = document.getElementById('auth-success'); // only exists on login.html

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const originalButtonText = submitBtn.textContent;

// Already logged in? Then there is nothing to do here.
if (getToken()) {
  window.location.href = 'index.html';
}

// Coming from a successful registration? (register redirects to login.html?registered=1)
if (successEl && new URLSearchParams(window.location.search).get('registered')) {
  successEl.textContent = 'Account created! Please log in.';
  successEl.hidden = false;
}

// ---------- Error display ----------
function showErrors(messages) {
  errorsEl.innerHTML = '';
  const ul = document.createElement('ul');
  messages.forEach((msg) => {
    const li = document.createElement('li');
    li.textContent = msg; // textContent is safe: it never runs HTML
    ul.appendChild(li);
  });
  errorsEl.appendChild(ul);
  errorsEl.hidden = false;
}

function clearErrors() {
  errorsEl.hidden = true;
  errorsEl.innerHTML = '';
}

// Quick checks in the browser, so the user gets feedback without a round trip.
// The server checks again: browser checks can always be skipped by an attacker.
function validate(email, password) {
  const messages = [];
  if (!email) messages.push('Email is required');
  else if (!EMAIL_REGEX.test(email)) messages.push('Please enter a valid email address');
  if (!password) messages.push('Password is required');
  else if (mode === 'register' && password.length < 6) {
    messages.push('Password must be at least 6 characters');
  }
  return messages;
}

// ---------- Loading state ----------
function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Please wait...' : originalButtonText;
}

// ---------- Submit ----------
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  if (successEl) successEl.hidden = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const messages = validate(email, password);
  if (messages.length > 0) {
    showErrors(messages);
    return;
  }

  setLoading(true);
  try {
    // Plain fetch here (not authFetch): we don't have a token yet, and a 401
    // on the login page just means "wrong email or password".
    const response = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      const list = (data && data.messages) || [];
      showErrors(list.length > 0 ? list : [(data && data.error) || `Request failed (${response.status})`]);
      return;
    }

    if (mode === 'login') {
      // Save the token and open the expense page
      saveLogin(data.token, data.user);
      window.location.href = 'index.html';
    } else {
      // Registered: go to the login page with a success message
      window.location.href = 'login.html?registered=1';
    }
  } catch (err) {
    // fetch only throws when the server can't be reached at all
    showErrors(['Cannot reach the server. Is it running?']);
  } finally {
    setLoading(false);
  }
});
