// middleware/errorHandler.js
// Central place where ALL errors end up. Instead of every route deciding
// how to answer when something goes wrong, routes just call next(err)
// and this file turns the error into a clean JSON response.

// 1) 404 handler for API routes that do not exist, e.g. GET /api/banana
function notFound(req, res, next) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// 2) The error handler itself.
// Express knows this is an ERROR handler because it has 4 parameters (err, req, res, next).
function errorHandler(err, req, res, next) {
  // Mongoose validation failed (missing title, negative amount, wrong category...)
  if (err.name === 'ValidationError') {
    // err.errors is an object like { title: {...}, amount: {...} }.
    // We turn it into a simple list of readable messages.
    const messages = Object.values(err.errors).map((e) => {
      // A CastError inside validation means the type was wrong, e.g. amount: "abc"
      if (e.name === 'CastError') return `${e.path} must be a valid ${e.kind.toLowerCase()}`;
      return e.message;
    });
    return res.status(400).json({ error: 'Validation failed', messages });
  }

  // Mongoose could not convert a value, most often an invalid id like /api/expenses/123
  if (err.name === 'CastError') {
    if (err.path === '_id') {
      return res.status(400).json({ error: `Invalid expense id: ${err.value}` });
    }
    return res.status(400).json({ error: `Invalid value for ${err.path}` });
  }

  // The request body was not valid JSON (thrown by express.json())
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  // MongoDB "duplicate key" error: a unique field (like a user's email)
  // already has this value. err.keyValue tells us which field it was.
  if (err.code === 11000) {
    if (err.keyValue && err.keyValue.email !== undefined) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    return res.status(409).json({ error: 'This record already exists' });
  }

  // The JWT has expired (checked before JsonWebTokenError, because
  // TokenExpiredError is a special kind of JsonWebTokenError)
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Your session has expired, please log in again' });
  }

  // The JWT is invalid: changed, badly formed, or signed with a different secret
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token, please log in again' });
  }

  // Errors we created ourselves with a status code (see middleware/httpError.js)
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Anything else is unexpected: log it for the developer,
  // but only send a generic message to the user (don't leak details).
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

module.exports = { notFound, errorHandler };
