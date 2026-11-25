// middleware/httpError.js
// Create an Error that carries an HTTP status code.
// Our errorHandler sees err.statusCode and uses it.
// Shared by the expense routes, the auth routes and the auth middleware.

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = httpError;
