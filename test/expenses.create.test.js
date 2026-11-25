// test/expenses.create.test.js
// Tests for POST /api/expenses (create an expense)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const Expense = require('../models/Expense');
const { app, connectTestDb, disconnectTestDb, createUserAndLogin } = require('./helpers');

describe('POST /api/expenses', () => {
  let token;
  let user;

  before(async () => {
    await connectTestDb();
    ({ token, user } = await createUserAndLogin('create'));
  });

  after(async () => {
    await disconnectTestDb();
  });

  // A valid expense; each test changes one thing to make it invalid
  const validExpense = { title: 'Lunch', amount: 12.5, category: 'Food', date: '2025-03-10' };

  it('creates an expense and returns 201', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send(validExpense);

    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Lunch');
    assert.equal(res.body.amount, 12.5);
    assert.equal(res.body.category, 'Food');
    assert.equal(res.body.date, '2025-03-10T00:00:00.000Z');
    // The owner comes from the token, not from the request body
    assert.equal(res.body.user, user.id);

    // And it really is saved in the database
    const saved = await Expense.findById(res.body._id);
    assert.ok(saved, 'expense should exist in the database');
    assert.equal(saved.user.toString(), user.id);
  });

  it('ignores a "user" field in the body and still uses the logged-in user', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validExpense, user: '000000000000000000000000' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user, user.id);
  });

  it('returns 401 when no token is sent', async () => {
    const countBefore = await Expense.countDocuments({ user: user.id });
    const res = await request(app).post('/api/expenses').send(validExpense);

    assert.equal(res.status, 401);
    assert.match(res.body.error, /missing token/i);
    assert.equal(await Expense.countDocuments({ user: user.id }), countBefore, 'nothing should be saved');
  });

  it('returns 400 when the title is missing', async () => {
    const { title, ...noTitle } = validExpense;
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send(noTitle);

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Validation failed');
    assert.ok(res.body.messages.includes('Title is required'));
  });

  it('returns 400 when the amount is negative', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validExpense, amount: -5 });

    assert.equal(res.status, 400);
    assert.ok(res.body.messages.includes('Amount must be greater than 0'));
  });

  it('returns 400 when the category is not allowed', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validExpense, category: 'Holidays' });

    assert.equal(res.status, 400);
    assert.ok(res.body.messages.some((m) => m.startsWith('Category must be one of')));
  });
});
