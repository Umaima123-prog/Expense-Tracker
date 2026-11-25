// middleware/auth.js
// Protects routes. Put it in front of any route that needs a logged-in user:
//   app.use('/api/expenses', requireAuth, expenseRoutes);
//
// Steps:
//   1. Read the header  "Authorization: Bearer <token>"
//   2. Verify the token's signature and expiry with JWT_SECRET
//   3. Load the user from the database (they might have been deleted)
//   4. Put the user on req.user so the routes know who is asking
// If anything fails we answer 401 (Unauthorized).

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const httpError = require('./httpError');

async function requireAuth(req, res, next) {
  try {
    // 1) Get the token from the header
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return next(httpError(401, 'Not logged in: missing token'));
    }

    // 2) Verify. jwt.verify throws:
    //    - TokenExpiredError if the token is too old
    //    - JsonWebTokenError if it was changed, badly formed or signed with another secret
    // Both are turned into clear 401 messages by middleware/errorHandler.js.
    // algorithms: only accept the algorithm we sign with.
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // 3) Load the user (the password is not included thanks to select: false)
    const user = await User.findById(payload.sub);
    if (!user) {
      return next(httpError(401, 'The user for this token no longer exists'));
    }

    // 4) Hand the user to the next middleware / route
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
