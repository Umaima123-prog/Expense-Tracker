// test/expenses.summary.test.js
// Tests for GET /api/expenses/summary?month=YYYY-MM

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, connectTestDb, disconnectTestDb, createUserAndLogin } = require('./helpers');

describe('GET /api/expenses/summary', () => {
  let alice; // the user whose summary we check
  let bob; // a second user whose expenses must NOT show up in Alice's summary

  // Create an expense through the real POST route
  async function addExpense(token, expense) {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send(expense);
    assert.equal(res.status, 201, 'test data should be created');
  }

  function getSummary(token, month) {
    return request(app)
      .get('/api/expenses/summary')
      .query({ month })
      .set('Authorization', `Bearer ${token}`);
  }

  before(async () => {
    await connectTestDb();
    alice = await createUserAndLogin('summary-alice');
    bob = await createUserAndLogin('summary-bob');

    // Alice, March 2025 (these SHOULD be counted)
    await addExpense(alice.token, { title: 'Groceries', amount: 10.5, category: 'Food', date: '2025-03-01' });
    await addExpense(alice.token, { title: 'Coffee', amount: 4.25, category: 'Food', date: '2025-03-15' });
    await addExpense(alice.token, { title: 'Bus pass', amount: 20, category: 'Transport', date: '2025-03-20' });
    await addExpense(alice.token, { title: 'Electricity', amount: 100, category: 'Bills', date: '2025-03-31' });

    // Alice, just outside March (must NOT be counted)
    await addExpense(alice.token, { title: 'Feb dinner', amount: 50, category: 'Food', date: '2025-02-28' });
    await addExpense(alice.token, { title: 'April train', amount: 30, category: 'Transport', date: '2025-04-01' });

    // Bob, March 2025 (must NOT appear in Alice's summary)
    await addExpense(bob.token, { title: 'Bob food', amount: 999, category: 'Food', date: '2025-03-10' });
    await addExpense(bob.token, { title: 'Bob other', amount: 1, category: 'Other', date: '2025-03-11' });
  });

  after(async () => {
    await disconnectTestDb();
  });

  it('returns the correct totals per category for a month', async () => {
    const res = await getSummary(alice.token, '2025-03');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      month: '2025-03',
      total: 134.75,
      // sorted alphabetically by category
      categories: [
        { category: 'Bills', total: 100 },
        { category: 'Food', total: 14.75 },
        { category: 'Transport', total: 20 },
      ],
    });
  });

  it('returns zero and no categories for a month without expenses', async () => {
    const res = await getSummary(alice.token, '2025-07');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { month: '2025-07', total: 0, categories: [] });
  });

  it('returns 400 for an invalid month format', async () => {
    for (const month of ['2025-13', '2025-3', 'March', '2025/03']) {
      const res = await getSummary(alice.token, month);
      assert.equal(res.status, 400, `month "${month}" should be rejected`);
      assert.match(res.body.error, /Invalid month format/);
    }
  });

  it("does not count another user's expenses", async () => {
    // Alice's summary contains nothing of Bob's (no 999, no "Other" category)
    const aliceRes = await getSummary(alice.token, '2025-03');
    assert.equal(aliceRes.body.total, 134.75);
    assert.ok(!aliceRes.body.categories.some((c) => c.category === 'Other'));

    // And the other way round: Bob only sees his own expenses
    const bobRes = await getSummary(bob.token, '2025-03');
    assert.equal(bobRes.status, 200);
    assert.deepEqual(bobRes.body, {
      month: '2025-03',
      total: 1000,
      categories: [
        { category: 'Food', total: 999 },
        { category: 'Other', total: 1 },
      ],
    });
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/expenses/summary').query({ month: '2025-03' });
    assert.equal(res.status, 401);
  });
});
