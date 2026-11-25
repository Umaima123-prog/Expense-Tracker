// middleware/asyncHandler.js
// A tiny helper so we don't have to write try/catch in every route.
//
// It takes an async route function and returns a new function that runs it.
// If the async function throws an error (or its promise rejects), .catch(next)
// passes that error to Express, which then sends it to our errorHandler.

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
