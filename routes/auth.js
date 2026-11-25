// routes/auth.js
// Register and login. Mounted in server.js at "/api/auth".

const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const httpError = require('../middleware/httpError');

const router = express.Router();

// The same simple email check as in the User model
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One generic message for EVERY login failure. If we said "email not found"
// or "wrong password", an attacker could find out which emails have accounts.
const LOGIN_FAILED = 'Invalid email or password';

// Check email and password before touching the database.
// Returns a list of error messages (empty list = everything is fine).
function validateCredentials(email, password) {
  const messages = [];
  if (typeof email !== 'string' || email.trim() === '') {
    messages.push('Email is required');
  } else if (!EMAIL_REGEX.test(email.trim())) {
    messages.push('Please enter a valid email address');
  }
  if (typeof password !== 'string' || password === '') {
    messages.push('Password is required');
  } else if (password.length < 6) {
    messages.push('Password must be at least 6 characters');
  }
  return messages;
}

// Only ever send these two fields to the browser (never the password hash)
function publicUser(user) {
  return { id: user._id, email: user.email };
}

// ---------- POST /api/auth/register ----------
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    const messages = validateCredentials(email, password);
    if (messages.length > 0) {
      return res.status(400).json({ error: 'Validation failed', messages });
    }

    // Friendly check for an existing account. (If two requests arrive at the
    // same moment, the unique index still stops the duplicate and the
    // errorHandler turns error code 11000 into a 409 as well.)
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) throw httpError(409, 'Email already registered');

    // The pre-save hook in models/User.js hashes the password here
    const user = await User.create({ email, password });

    res.status(201).json({ user: publicUser(user) });
  })
);

// ---------- POST /api/auth/login ----------
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    // Missing or malformed input -> same generic 401 as a wrong password
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      throw httpError(401, LOGIN_FAILED);
    }

    // The password field has select: false, so we must ask for it explicitly
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');

    // Unknown email OR wrong password -> exactly the same answer
    if (!user || !(await user.comparePassword(password))) {
      throw httpError(401, LOGIN_FAILED);
    }

    // Create the JWT. The payload only holds the user id ("sub" = subject).
    // NEVER put the password (or anything secret) in a token: anyone can
    // decode the payload, it is only signed, not encrypted.
    const token = jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    });

    res.json({ token, user: publicUser(user) });
  })
);

module.exports = router;
