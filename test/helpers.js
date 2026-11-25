// test/helpers.js
// Shared setup for the tests: connect to a SEPARATE test database, create
// test users through the real API, and clean up afterwards.
//
// SAFETY RULES
//   - We never connect to the real database used by the app.
//   - If MONGO_URI_TEST is set in .env we use it. Otherwise we take MONGO_URI
//     (same cluster and same login) and only change the database name to
//     "expensedb_test".
//   - Before AND after connecting we check that the database name looks like
//     a test database. If it doesn't, the tests stop immediately.
//   - Connection strings are never printed.

require('dotenv').config({ quiet: true });

const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');
const User = require('../models/User');
const Expense = require('../models/Expense');

const DEFAULT_TEST_DB = 'expensedb_test';

// All test users get an email on this domain, so we can always find (and
// delete) them again. ".test" is a reserved domain that can never be real.
const TEST_EMAIL_DOMAIN = 'expense-tests.example.test';

// A database name counts as a "test" name only if it is "test" or ends with
// "_test" / "-test", for example "expensedb_test".
function isTestDbName(name) {
  return typeof name === 'string' && /(^|[_-])test$/i.test(name);
}

// Read the database name out of a mongodb:// or mongodb+srv:// string,
// e.g. "mongodb+srv://user:pass@host/mydb?retryWrites=true" -> "mydb".
// Returns '' if the string has no database name.
function dbNameFromUri(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(uri);
  return match ? decodeURIComponent(match[1]) : '';
}

// Throws (and so stops the tests) with a message that never contains the URI
function refuse(reason) {
  throw new Error(`Refusing to run tests: ${reason}`);
}

// Decide which URI and database name to use, without connecting yet.
function getTestDbConfig() {
  const testUri = process.env.MONGO_URI_TEST;
  const realUri = process.env.MONGO_URI;

  if (testUri) {
    if (realUri && testUri.trim() === realUri.trim()) {
      refuse('MONGO_URI_TEST is the same as MONGO_URI (the real database).');
    }
    const name = dbNameFromUri(testUri);
    if (!isTestDbName(name)) {
      refuse('the database name in MONGO_URI_TEST must be a test name, e.g. "expensedb_test".');
    }
    return { uri: testUri, dbName: name };
  }

  if (!realUri) {
    refuse('neither MONGO_URI_TEST nor MONGO_URI is set in .env.');
  }

  // Same cluster and credentials as MONGO_URI; the dbName option replaces only
  // the database name that is written in the connection string.
  return { uri: realUri, dbName: DEFAULT_TEST_DB };
}

async function connectTestDb() {
  // Tests sign their own tokens through the real login route, so a secret is
  // needed. If .env has none, use a random one that only lives for this run.
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  }

  const { uri, dbName } = getTestDbConfig();

  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    // err.message from the driver does not include the password, but we keep
    // it short anyway and never print the URI ourselves.
    throw new Error(`Could not connect to the test database: ${err.message}`);
  }

  // Second guard: check the database we ACTUALLY ended up in.
  const connectedName = mongoose.connection.name;
  if (!isTestDbName(connectedName) || connectedName !== dbName) {
    await mongoose.disconnect();
    refuse(`connected database "${connectedName}" is not a test database.`);
  }

  // Make sure the unique email index exists before tests register users
  await User.init();
  await Expense.init();

  // Remove leftovers from an EARLIER run that crashed before cleaning up.
  // Only users older than 10 minutes: the test files run in parallel, and we
  // must not delete users that another test file is using right now.
  const emailPattern = new RegExp(`@${TEST_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`);
  const leftovers = await User.find({
    email: emailPattern,
    createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
  }).select('_id');
  await removeUsersAndExpenses(leftovers.map((u) => u._id));

  return connectedName;
}

// Ids of the users created by THIS test file, deleted again at the end
const createdUserIds = [];

// Delete the given users and all of their expenses.
async function removeUsersAndExpenses(ids) {
  // Last safety check before deleting anything
  if (!isTestDbName(mongoose.connection.name)) {
    refuse('cleanup was asked to run on a non-test database.');
  }
  if (ids.length === 0) return;
  await Expense.deleteMany({ user: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
}

async function disconnectTestDb() {
  if (mongoose.connection.readyState === 1) {
    await removeUsersAndExpenses(createdUserIds);
    createdUserIds.length = 0;
    await mongoose.disconnect();
  }
}

// Register a brand-new user through POST /api/auth/register, log in through
// POST /api/auth/login, and return { token, user }.
async function createUserAndLogin(label) {
  const email = `${label}-${crypto.randomBytes(6).toString('hex')}@${TEST_EMAIL_DOMAIN}`;
  const password = 'test-password-123';

  const registerRes = await request(app).post('/api/auth/register').send({ email, password });
  if (registerRes.status !== 201) {
    throw new Error(`Register failed with status ${registerRes.status}`);
  }
  // Remember the user right away, so it is cleaned up even if login fails
  createdUserIds.push(registerRes.body.user.id);

  const loginRes = await request(app).post('/api/auth/login').send({ email, password });
  if (loginRes.status !== 200 || !loginRes.body.token) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }

  return { token: loginRes.body.token, user: loginRes.body.user };
}

module.exports = {
  app,
  connectTestDb,
  disconnectTestDb,
  createUserAndLogin,
  isTestDbName,
  dbNameFromUri,
};
