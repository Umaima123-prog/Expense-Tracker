// models/User.js
// Describes one user account. Passwords are NEVER stored as plain text:
// a "pre-save hook" turns them into a bcrypt hash before they reach the database.

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// How much work bcrypt does per hash. Higher = slower = harder to brute force.
// 10 is a common, sensible default.
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // creates a unique index: two users can't share an email
      lowercase: true, // "Ana@Mail.com" is saved as "ana@mail.com"
      trim: true,
      // Basic format check: something@something.something (no spaces)
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      // select: false = this field is NOT returned by queries unless we
      // explicitly ask for it with .select('+password'). This protects us
      // from accidentally sending the hash to the browser.
      select: false,
    },
  },
  { timestamps: true }
);

// ---------- Pre-save hook ----------
// Runs automatically right before a user is saved (User.create or user.save()).
userSchema.pre('save', async function () {
  // Only hash if the password is new or was changed.
  // Otherwise we would hash the hash again on every save.
  if (!this.isModified('password')) return;

  // bcrypt.hash creates a random salt and hashes "salt + password" together.
  // The result contains the salt, so we don't need to store it separately.
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

// ---------- Instance method ----------
// Usage: const ok = await user.comparePassword('plain text from the login form');
// bcrypt reads the salt out of the stored hash, hashes the given password
// the same way, and checks if the results match.
userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
