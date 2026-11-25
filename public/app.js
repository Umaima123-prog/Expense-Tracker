// public/app.js
// Runs in the browser. Talks to our API with authFetch() (from api.js) and updates the page.

const API_URL = '/api/expenses';
const REQUEST_TIMEOUT_MS = 10000; // if the API takes longer than 10 seconds, show an error

// ---------- Grab the HTML elements we need ----------
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');

const monthInput = document.getElementById('month');
const summaryTotalEl = document.getElementById('summary-total');
const summaryCategoriesEl = document.getElementById('summary-categories');

const form = document.getElementById('expense-form');
const formTitle = document.getElementById('form-title');
const formErrorsEl = document.getElementById('form-errors');
const titleInput = document.getElementById('title');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const dateInput = document.getElementById('date');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');

const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

const rowsEl = document.getElementById('expense-rows');
const emptyEl = document.getElementById('empty');

// ---------- App state ----------
let expenses = []; // the list we got from the server
let editingId = null; // null = adding a new expense, otherwise the id we are editing
let pendingRequests = 0; // how many requests are running right now

// ---------- Small helpers ----------

// Format a number as money, e.g. 12.5 -> "12.50"
function formatMoney(value) {
  return Number(value).toFixed(2);
}

// Turn a date from the API ("2026-11-05T00:00:00.000Z") into "2026-11-05".
// That is also the format <input type="date"> needs.
function toDateInputValue(isoString) {
  return isoString.slice(0, 10);
}

// Today's date as "YYYY-MM-DD" (in the user's local time)
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

// Show validation messages near the form as a list
function showFormErrors(messages) {
  formErrorsEl.innerHTML = '';
  const ul = document.createElement('ul');
  messages.forEach((msg) => {
    const li = document.createElement('li');
    li.textContent = msg; // textContent is safe: it never runs HTML
    ul.appendChild(li);
  });
  formErrorsEl.appendChild(ul);
  formErrorsEl.hidden = false;
}

function clearFormErrors() {
  formErrorsEl.hidden = true;
  formErrorsEl.innerHTML = '';
}

// ---------- One function for all API calls ----------
// It shows "Loading...", adds a timeout, and turns failed responses into errors.
// It uses authFetch (from api.js), which adds the token to every request and
// sends the user to the login page if the server answers 401.
async function apiRequest(url, options = {}) {
  pendingRequests++;
  loadingEl.hidden = false;

  // AbortController lets us cancel the request if it is too slow
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await authFetch(url, {
      ...options,
      signal: controller.signal,
    });

    // Try to read JSON. If the body isn't JSON, data stays null.
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      // Build an Error that also carries the validation messages (if any)
      const err = new Error((data && data.error) || `Request failed (${response.status})`);
      err.messages = (data && data.messages) || [];
      throw err;
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('The server is taking too long to respond. Please try again.');
    }
    if (err instanceof TypeError) {
      // fetch throws TypeError when the server can't be reached at all
      throw new Error('Cannot reach the server. Is it running?');
    }
    throw err;
  } finally {
    // This runs whether the request worked or failed
    clearTimeout(timer);
    pendingRequests--;
    if (pendingRequests === 0) loadingEl.hidden = true;
  }
}

// ---------- Load and show the expense list ----------
async function loadExpenses() {
  try {
    expenses = await apiRequest(API_URL);
    renderExpenses();
  } catch (err) {
    showError('Could not load expenses: ' + err.message);
  }
}

function renderExpenses() {
  rowsEl.innerHTML = '';
  emptyEl.hidden = expenses.length > 0;

  expenses.forEach((expense) => {
    const tr = document.createElement('tr');

    // Create each cell with textContent (safe against HTML in titles)
    [expense.title, formatMoney(expense.amount), expense.category, toDateInputValue(expense.date)].forEach(
      (text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
    );

    // Actions cell with Edit and Delete buttons
    const actionsTd = document.createElement('td');
    actionsTd.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'btn btn-small';
    editBtn.addEventListener('click', () => startEdit(expense));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.addEventListener('click', () => deleteExpense(expense));

    actionsTd.append(editBtn, deleteBtn);
    tr.appendChild(actionsTd);
    rowsEl.appendChild(tr);
  });
}

// ---------- Load and show the monthly summary ----------
async function loadSummary() {
  try {
    const summary = await apiRequest(`${API_URL}/summary?month=${encodeURIComponent(monthInput.value)}`);

    summaryTotalEl.textContent = formatMoney(summary.total);
    summaryCategoriesEl.innerHTML = '';

    if (summary.categories.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No expenses this month';
      summaryCategoriesEl.appendChild(li);
    }

    summary.categories.forEach((c) => {
      const li = document.createElement('li');
      li.textContent = `${c.category}: ${formatMoney(c.total)}`;
      summaryCategoriesEl.appendChild(li);
    });
  } catch (err) {
    showError('Could not load summary: ' + err.message);
  }
}

// Reload both the list and the summary (after add, edit, delete)
function refreshAll() {
  return Promise.all([loadExpenses(), loadSummary()]);
}

// ---------- Add / Edit form ----------

function resetForm() {
  editingId = null;
  form.reset();
  dateInput.value = todayString();
  formTitle.textContent = 'Add expense';
  submitBtn.textContent = 'Add';
  cancelBtn.hidden = true;
  clearFormErrors();
}

// Fill the form with an existing expense and switch to "edit mode"
function startEdit(expense) {
  editingId = expense._id;
  titleInput.value = expense.title;
  amountInput.value = expense.amount;
  categoryInput.value = expense.category;
  dateInput.value = toDateInputValue(expense.date);

  formTitle.textContent = 'Edit expense';
  submitBtn.textContent = 'Update';
  cancelBtn.hidden = false;
  clearFormErrors();
  form.scrollIntoView({ behavior: 'smooth' });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); // stop the browser from reloading the page
  clearError();
  clearFormErrors();

  // Collect the form values. Empty fields are left out,
  // so the API's validation can tell us what's missing.
  const data = {};
  if (titleInput.value.trim()) data.title = titleInput.value;
  if (amountInput.value !== '') data.amount = Number(amountInput.value);
  if (categoryInput.value) data.category = categoryInput.value;
  if (dateInput.value) data.date = dateInput.value;

  const isEditing = editingId !== null;
  const url = isEditing ? `${API_URL}/${editingId}` : API_URL;
  const method = isEditing ? 'PUT' : 'POST';

  submitBtn.disabled = true; // prevent double clicks while saving
  try {
    await apiRequest(url, { method, body: JSON.stringify(data) });
    resetForm();
    await refreshAll();
  } catch (err) {
    // Validation errors go next to the form, other errors at the top
    if (err.messages && err.messages.length > 0) {
      showFormErrors(err.messages);
    } else {
      showFormErrors([err.message]);
    }
  } finally {
    submitBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', resetForm);

// ---------- Delete ----------
async function deleteExpense(expense) {
  if (!confirm(`Delete "${expense.title}"?`)) return;

  clearError();
  try {
    await apiRequest(`${API_URL}/${expense._id}`, { method: 'DELETE' });
    // If we were editing the expense we just deleted, leave edit mode
    if (editingId === expense._id) resetForm();
    await refreshAll();
  } catch (err) {
    showError('Could not delete expense: ' + err.message);
  }
}

// ---------- Month picker ----------
monthInput.addEventListener('change', () => {
  clearError();
  loadSummary();
});

// ---------- Logout ----------
// Forget the token and go to the login page.
// (A JWT can't be "switched off" on the server; we simply throw it away.)
logoutBtn.addEventListener('click', () => {
  clearLogin();
  goToLogin();
});

// ---------- Start the app ----------
const currentUser = getUser();
userEmailEl.textContent = currentUser ? currentUser.email : '';
monthInput.value = todayString().slice(0, 7); // "YYYY-MM" = current month
resetForm();
refreshAll();
