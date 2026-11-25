// routes/expenses.js
// All the API endpoints for expenses. In server.js this router is mounted
// at "/api/expenses", so router.get('/') here means GET /api/expenses.
//
// Every route here runs AFTER the auth middleware (see server.js), so
// req.user is always the logged-in user. Every query includes
// { user: req.user._id } so people only ever see and change their OWN expenses.
// If an expense belongs to someone else, the query simply finds nothing and we
// answer 404 "not found" (not 403), so we don't even reveal that it exists.

const express = require('express');
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const asyncHandler = require('../middleware/asyncHandler');
const httpError = require('../middleware/httpError');

const router = express.Router();

// ---------- Small helpers ----------

// A MongoDB ObjectId is exactly 24 hexadecimal characters (0-9, a-f).
function isValidId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

// Only take the fields we allow from the request body.
// This stops someone from sending e.g. { _id: ... } or { user: ... } and changing
// things they shouldn't (like moving an expense to another user's account).
function pickExpenseFields(body) {
  const data = {};
  ['title', 'amount', 'category', 'date'].forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });
  return data;
}

// Middleware that runs for every route with ":id" in it.
// If the id has the wrong format, we stop right away with a 400.
router.param('id', (req, res, next, id) => {
  if (!isValidId(id)) {
    return next(httpError(400, `Invalid expense id: ${id}`));
  }
  next();
});

// ---------- Routes ----------

// GET /api/expenses -> list MY expenses, newest date first
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // sort: -1 means descending (newest first). createdAt breaks ties on the same date.
    const expenses = await Expense.find({ user: req.user._id }).sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  })
);

// GET /api/expenses/summary?month=YYYY-MM -> totals per category for one month
// IMPORTANT: this must come BEFORE "/:id", otherwise Express would think
// "summary" is an id and call the wrong route.
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    let month = req.query.month;

    // No month given? Use the current month, e.g. "2026-11"
    if (!month) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // Check the format: 4 digits, a dash, then 01 to 12
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw httpError(400, 'Invalid month format. Use YYYY-MM, for example 2026-11');
    }

    const [year, monthNumber] = month.split('-').map(Number);

    // First moment of this month, and first moment of next month.
    // JavaScript months start at 0, so monthNumber - 1 is "this month"
    // and monthNumber is "next month" (Date.UTC handles December -> January).
    // We use UTC because dates like "2026-11-05" are stored as UTC midnight.
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));

    // IMPORTANT: aggregate() does NOT convert strings to ObjectIds for us the
    // way find() does. We build a real ObjectId, otherwise $match would compare
    // against the wrong type and find nothing.
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const results = await Expense.aggregate([
      // Step 1 ($match): keep only MY expenses inside this month.
      // $gte = greater than or equal, $lt = less than (so next month is NOT included)
      { $match: { user: userId, date: { $gte: start, $lt: end } } },

      // Step 2 ($group): put expenses with the same category together
      // and add up their amounts.
      { $group: { _id: '$category', total: { $sum: '$amount' } } },

      // Step 3 ($sort): alphabetical by category, so the output order is stable
      { $sort: { _id: 1 } },
    ]);

    // Rename _id -> category to make the JSON nicer
    const categories = results.map((r) => ({ category: r._id, total: r.total }));

    // Grand total = sum of all category totals.
    // Rounded to 2 decimals to avoid floating point noise like 10.299999999.
    const total = Math.round(categories.reduce((sum, c) => sum + c.total, 0) * 100) / 100;

    res.json({ month, total, categories });
  })
);

// GET /api/expenses/:id -> one of MY expenses
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    // Match by id AND owner. Someone else's expense -> null -> 404
    const expense = await Expense.findOne({ _id: req.params.id, user: req.user._id });
    if (!expense) throw httpError(404, 'Expense not found');
    res.json(expense);
  })
);

// POST /api/expenses -> create a new expense
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Expense.create runs the validation from the model.
    // If it fails, it throws a ValidationError -> errorHandler sends 400.
    const data = pickExpenseFields(req.body || {});
    data.user = req.user._id; // the owner always comes from the token, never from the body
    const expense = await Expense.create(data);
    res.status(201).json(expense); // 201 = "Created"
  })
);

// PUT /api/expenses/:id -> update one of MY expenses
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const expense = await Expense.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, pickExpenseFields(req.body || {}), {
      returnDocument: 'after', // return the document AFTER the update (not the old one)
      runValidators: true, // check the model rules on updates too
    });
    if (!expense) throw httpError(404, 'Expense not found');
    res.json(expense);
  })
);

// DELETE /api/expenses/:id -> delete one of MY expenses
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!expense) throw httpError(404, 'Expense not found');
    res.json({ message: 'Expense deleted', id: expense._id });
  })
);

module.exports = router;
