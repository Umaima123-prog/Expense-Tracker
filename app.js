// app.js
// Builds the Express app (middleware, routes, error handler) and EXPORTS it.
// It does NOT connect to MongoDB and does NOT call listen():
//   - server.js connects to the real database and starts listening on a port
//   - the tests import this app and send requests to it with Supertest

const path = require('path');
const express = require('express');

const expenseRoutes = require('./routes/expenses');
const authRoutes = require('./routes/auth');
const requireAuth = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// ---------- Middleware ----------

// Lets Express read JSON request bodies (req.body)
app.use(express.json());

// Serve the frontend (index.html, style.css, app.js) from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Routes ----------

// Register and login are public (no token needed)
app.use('/api/auth', authRoutes);

// All expense routes need a valid token: requireAuth runs first and sets req.user
app.use('/api/expenses', requireAuth, expenseRoutes);

// Any other /api/... URL that didn't match above -> 404 JSON
app.use('/api', notFound);

// The error handler must be registered LAST, after all routes
app.use(errorHandler);

module.exports = app;
